"""Manually reviewed benchmark harness. This is not an execution sandbox for production."""
from __future__ import annotations

import ast
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent
baseline = json.loads((ROOT / "benchmark-run-2.json").read_text())
fibonacci_retry = json.loads((ROOT / "fibonacci-retry.json").read_text())
results = {item["id"]: item for item in baseline["results"]}
results["fibonacci"]["answer"] = fibonacci_retry["answer"]
results["fibonacci"]["responseMs"] = fibonacci_retry["responseMs"]
results["fibonacci"]["finishReason"] = fibonacci_retry["finishReason"]

checks = {
    "sum": "assert add(3, 5) == 8\nassert add(-3, 2) == -1\nassert add(0, 0) == 0",
    "even-odd": "assert classify_even_odd(4) == 'Even'\nassert classify_even_odd(7) == 'Odd'\nassert classify_even_odd(0) == 'Even'\nassert classify_even_odd(-3) == 'Odd'",
    "factorial": "assert iterative_factorial(0) == 1\nassert iterative_factorial(1) == 1\nassert iterative_factorial(5) == 120\n\ntry:\n    iterative_factorial(-1)\nexcept ValueError:\n    pass\nelse:\n    raise AssertionError('negative input should raise ValueError')",
    "prime": "assert is_prime(2) is True\nassert is_prime(1) is False\nassert is_prime(-7) is False\nassert is_prime(21) is False\nassert is_prime(97) is True",
    "fibonacci": "assert generate_fibonacci(0) == []\nassert generate_fibonacci(1) == [0]\nassert generate_fibonacci(2) == [0, 1]\nassert generate_fibonacci(7) == [0, 1, 1, 2, 3, 5, 8]",
    "palindrome": "assert is_palindrome('A man, a plan, a canal: Panama') is True\nassert is_palindrome('No x in Nixon') is True\nassert is_palindrome('Hello, World!') is False\nassert is_palindrome('') is True",
    "vowels": "assert count_vowels('AEIOU') == 5\nassert count_vowels('Python') == 1\nassert count_vowels('rhythm') == 0\nassert count_vowels('') == 0",
    "max-list": "assert find_largest_number([-4, 0, 12, 12]) == 12\nassert find_largest_number([5]) == 5\n\ntry:\n    find_largest_number([])\nexcept ValueError:\n    pass\nelse:\n    raise AssertionError('empty list should raise ValueError')",
    "fizzbuzz": "assert fizz_buzz(0) == []\nassert fizz_buzz(5) == ['1', '2', 'Fizz', '4', 'Buzz']\nassert fizz_buzz(15)[14] == 'FizzBuzz'",
    "word-count": "assert count_words('Python, python!') == {'python': 2}\nassert count_words('Learn Python today, and python will help you tomorrow! Tomorrow?')['tomorrow'] == 2\nassert count_words('   ') == {}",
}

blocked_calls = {"open", "eval", "exec", "compile", "__import__", "input", "breakpoint", "globals", "locals", "getattr", "setattr", "delattr"}
blocked_attrs = {"system", "popen", "fork", "connect", "urlopen", "run", "Popen", "write_text", "unlink", "remove"}
rows = []
with tempfile.TemporaryDirectory(prefix="aura-benchmark-") as tmp:
    temp = pathlib.Path(tmp)
    for problem_id, checks_source in checks.items():
        item = results[problem_id]
        matches = re.findall(r"```(?:python)?\s*\n([\s\S]*?)```", item["answer"])
        if not matches:
            rows.append({"id": problem_id, "status": "incomplete-response", "responseMs": item.get("responseMs")})
            continue
        source = matches[0]
        try:
            tree = ast.parse(source)
            imports = [alias.name.split(".")[0] for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names]
            imports += [node.module.split(".")[0] for node in ast.walk(tree) if isinstance(node, ast.ImportFrom) and node.module]
            if any(module != "string" for module in imports):
                raise ValueError(f"unreviewed imports: {imports}")
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in blocked_calls:
                    raise ValueError(f"blocked call: {node.func.id}")
                if isinstance(node, ast.Attribute) and node.attr in blocked_attrs:
                    raise ValueError(f"blocked attribute: {node.attr}")
        except Exception as error:
            rows.append({"id": problem_id, "status": "static-review-blocked", "reason": str(error), "responseMs": item.get("responseMs")})
            continue
        script = temp / f"{problem_id}.py"
        script.write_text(source + "\n\n" + checks_source + "\nprint('PASS')\n")
        env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "PYTHONIOENCODING": "utf-8"}
        try:
            run = subprocess.run([sys.executable, "-I", "-S", str(script)], cwd=temp, env=env, capture_output=True, text=True, timeout=3)
            rows.append({"id": problem_id, "status": "pass" if run.returncode == 0 and "PASS" in run.stdout else "fail", "responseMs": item.get("responseMs"), "exitCode": run.returncode, "stdout": run.stdout[-1200:], "stderr": run.stderr[-1200:]})
        except subprocess.TimeoutExpired:
            rows.append({"id": problem_id, "status": "timeout", "responseMs": item.get("responseMs")})

report = {
    "model": baseline["model"],
    "runAt": datetime.now(timezone.utc).isoformat(),
    "method": "Reviewed imports and dangerous calls, then ran the generated Python snippets with explicit assertions in short-lived isolated Python processes (-I -S, 3-second timeout). This is an evaluation harness, not a production sandbox.",
    "testCount": len(rows),
    "passed": sum(row["status"] == "pass" for row in rows),
    "failedOrIncomplete": [row for row in rows if row["status"] != "pass"],
    "results": rows,
}
(ROOT / "benchmark-validation.json").write_text(json.dumps(report, indent=2))
print(json.dumps({"testCount": report["testCount"], "passed": report["passed"], "failedOrIncomplete": report["failedOrIncomplete"], "outFile": "evaluation/benchmark-validation.json"}, indent=2))

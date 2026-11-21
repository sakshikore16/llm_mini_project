# Aura evaluation run

Run date: 2026-11-21  
Model: Gemini 3.5 Flash-Lite  
Benchmark prompt style: Zero-shot

## Ten Python problems

The guided suite covers addition, even/odd classification, factorial, primality, Fibonacci, phrase palindromes, vowel counts, largest list value, FizzBuzz, and word frequency. Each generated Python snippet was reviewed for imports and dangerous calls, then run in a short-lived Python process with explicit assertions and a three-second timeout. **10 of 10 passed** the listed checks in this run.

This is an evaluation harness, not a hardened production sandbox. The app provides an opt-in browser Web Worker runner for Python; users should inspect each answer, run it against the listed checks, and then record their result in the lab. The server does not execute submitted or generated code.

The benchmark generation run averaged **5.4 seconds** from client request to completed stream, with individual responses from **2.3 to 10.4 seconds**. This is one run per problem and is not a stable latency estimate.

## Prompt comparison

For one second-largest-distinct-value task, the measured responses were:

- Zero-shot: 11.7 seconds
- Few-shot: 12.2 seconds
- Step-by-step: 3.6 seconds

This is one sample per prompt strategy. The outputs showed the expected structural differences: direct solution, a generic worked example followed by the solution, and an ordered explanation with assumptions and checks. Do not treat these single observations as a statistical comparison.

## Security review sample

The Code security-review task identified SQL injection in a deliberately vulnerable f-string SQL query, explained the impact, and proposed a parameterized query. See `security-review-sample.json`.

## Reliability observation

Some initial provider responses ended before the requested explanation or code was complete. The stream handler now retains a final partial event and reports when the provider ends without a completion signal; the UI warns when the provider reports an output-limit or incomplete response. Always inspect generated code and test the relevant edge cases.

## Files

- `benchmark-run-2.json`: ten generated answers and per-request timing.
- `benchmark-validation.json`: per-problem syntax/safety review and assertion outcomes.
- `prompt-experiments.json`: same task generated with three prompt strategies.
- `fibonacci-retry.json`: retry after an incomplete first response.
- `security-review-sample.json`: SQL injection review sample.
- `validate_generated.py`: repeatable evaluator for the saved snippets. This script is for this reviewed evaluation only, not a general-purpose runtime sandbox.

# WeChat Duplicate Message Delivery TODO

This document tracks the already-observed duplicate or heavily overlapping
WeChat message delivery problem.

## Current Finding

The issue is confirmed in the real WeChat runtime. At least one observed
`/threads del` turn had only one inbound WeChat `messageId`, and
CodexBridge only started one provider turn, but outbound delivery still sent
overlapping content:

- a progress/preview message was sent first
- a final-answer preview chunk was sent later
- final delivery then sent the full final answer again with
  `completionMode: "full_final_commit"`

This means the confirmed failure is not simply WeChat showing one successful
send twice. CodexBridge can call outbound `send_text` more than once with
content that overlaps the already-delivered final answer.

## Suspected Root Cause

`WeixinBridgeRuntime` currently records streamed preview text in one combined
`streamState.streamedText` buffer.

That buffer can contain both:

- commentary progress, such as "I am checking..."
- final-answer preview text

`ensureFinalDelivered()` then uses that mixed buffer to decide whether the
already-delivered content is a prefix of the final answer. When commentary text
appears before the final answer preview, the mixed buffer is not a prefix of the
final answer, so the runtime falls back to sending the full final answer.

Result: the user can receive already-streamed final-answer content again.

## Fix Direction

- Split preview accounting into at least two concepts:
  - all streamed text for debug/observability
  - final-answer streamed text for final delivery prefix/tail calculation
- Use only the final-answer streamed text when deciding whether final delivery
  should send nothing, send only the tail, or send the full final answer.
- Keep commentary preview delivery behavior unchanged.
- Avoid adding broad scope/content dedupe as the primary fix. The root problem
  is incorrect final-tail calculation, not duplicate string dispatch alone.

## Regression Tests

Add focused tests for `WeixinBridgeRuntime` covering:

- commentary preview is sent
- final-answer preview is sent afterward
- final response returns the complete final answer
- runtime sends only the missing tail, or sends nothing when the preview already
  completed the final answer
- runtime does not send `full_final_commit` when final-answer preview has
  already delivered a prefix

Also keep a negative case where no final-answer preview was delivered, so full
final delivery remains valid.


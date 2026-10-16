"""A scripted stand-in for the LLM (PydanticAI FunctionModel): each step is one model response.

A step is a tool call (name, args) - the final answer is the tool call "final_result" - or a callable that
receives the messages so far and returns the response itself (to inspect what the model was sent).
"""

from collections.abc import Callable, Iterator
from typing import Any

from pydantic_ai.messages import ModelMessage, ModelResponse, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

Step = tuple[str, dict[str, Any]] | Callable[[list[ModelMessage]], ModelResponse]


def say(text: str, *quick_replies: str) -> tuple[str, dict[str, Any]]:
    return ("final_result", {"text": text, "quick_replies": list(quick_replies)})


def scripted(*steps: Step) -> FunctionModel:
    queue: Iterator[Step] = iter(steps)

    def respond(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        step = next(queue)
        if callable(step):
            return step(messages)
        name, args = step
        return ModelResponse(parts=[ToolCallPart(name, args)])

    return FunctionModel(respond)

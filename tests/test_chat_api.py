import json

import pytest

from ganesha import create_app
from ganesha.services.llm import ProviderError

from .conftest import FakeProvider, make_settings


def events(response):
    return [json.loads(line) for line in response.get_data(as_text=True).splitlines() if line.strip()]


def post_chat(client, messages, language=None):
    body = {"messages": messages}
    if language is not None:
        body["language"] = language
    return client.post("/api/chat", json=body)


def test_index_page_renders(client):
    res = client.get("/")
    assert res.status_code == 200
    assert b"Ganesha Guide" in res.data


def test_health_and_config(client):
    assert client.get("/api/health").get_json() == {"status": "ok"}
    cfg = client.get("/api/config").get_json()
    assert cfg["provider"] == {"name": "Groq", "model": "test-model", "configured": True}
    assert "hi" in cfg["languages"]
    assert cfg["maxMessageChars"] == 200
    assert "Namaste" in cfg["greeting"]


def test_chat_streams_ndjson(client, provider):
    res = post_chat(client, [{"role": "user", "content": "Hello"}])
    assert res.status_code == 200
    assert res.mimetype == "application/x-ndjson"
    evs = events(res)
    assert evs == [
        {"type": "delta", "text": "Namaste"},
        {"type": "delta", "text": ", friend!"},
        {"type": "done"},
    ]


def test_prompt_includes_persona_history_and_language(client, provider):
    history = [
        {"role": "user", "content": "First"},
        {"role": "assistant", "content": "Reply"},
        {"role": "user", "content": "Second"},
    ]
    post_chat(client, history, language="hi")
    sent = provider.calls[0]
    assert sent[0].role == "system"
    assert "Ganesha" in sent[0].content
    assert "Hindi" in sent[0].content
    assert [(m.role, m.content) for m in sent[1:]] == [("user", "First"), ("assistant", "Reply"), ("user", "Second")]


def test_history_is_trimmed(client, provider):
    msgs = []
    for i in range(10):
        msgs += [{"role": "user", "content": f"u{i}"}, {"role": "assistant", "content": f"a{i}"}]
    msgs.append({"role": "user", "content": "latest"})
    post_chat(client, msgs)
    sent = provider.calls[0]
    # system + 4 history messages (max_history_messages=4) + latest
    assert len(sent) == 6
    assert sent[-1].content == "latest"
    assert sent[1].content == "u8"


@pytest.mark.parametrize(
    "body, fragment",
    [
        (None, "JSON object"),
        ({"messages": []}, "non-empty list"),
        ({"messages": [{"role": "system", "content": "x"}]}, "role"),
        ({"messages": [{"role": "assistant", "content": "x"}]}, "last message"),
        ({"messages": [{"role": "user", "content": "   "}]}, "last message"),
        ({"messages": [{"role": "user", "content": "x" * 201}]}, "200 characters"),
        ({"messages": [{"role": "user", "content": "hi"}], "language": "fr"}, "language"),
    ],
)
def test_validation_errors(client, provider, body, fragment):
    res = client.post("/api/chat", json=body) if body is not None else client.post("/api/chat", data="nope")
    assert res.status_code == 400
    err = res.get_json()["error"]
    assert err["code"] == "invalid_request"
    assert fragment in err["message"]
    assert provider.calls == []


def test_political_message_is_redirected_without_calling_model(client, provider):
    res = post_chat(client, [{"role": "user", "content": "Who should I vote for in the election?"}])
    evs = events(res)
    assert evs[-1] == {"type": "done", "filtered": True}
    assert "politics" in evs[0]["text"]
    assert provider.calls == []


def test_ordinary_negative_words_are_not_blocked(client, provider):
    post_chat(client, [{"role": "user", "content": "I hate how anxious I feel before exams"}])
    assert len(provider.calls) == 1


def test_rate_limit_error_before_stream_returns_429():
    provider = FakeProvider(error=ProviderError("rate_limited", "Slow down", status=429, retry_after=12))
    client = create_app(settings=make_settings(), provider=provider).test_client()
    res = post_chat(client, [{"role": "user", "content": "Hello"}])
    assert res.status_code == 429
    assert res.headers["Retry-After"] == "12"
    assert res.get_json()["error"] == {"code": "rate_limited", "message": "Slow down", "retryAfter": 12}


def test_not_configured_error_returns_503():
    provider = FakeProvider(error=ProviderError("not_configured", "No key", status=503))
    client = create_app(settings=make_settings(), provider=provider).test_client()
    res = post_chat(client, [{"role": "user", "content": "Hello"}])
    assert res.status_code == 503
    assert res.get_json()["error"]["code"] == "not_configured"


def test_error_mid_stream_is_sent_as_event():
    provider = FakeProvider(chunks=["Part one", "never"], error=ProviderError("network", "Connection lost"), fail_after=1)
    client = create_app(settings=make_settings(), provider=provider).test_client()
    evs = events(post_chat(client, [{"role": "user", "content": "Hello"}]))
    assert evs == [
        {"type": "delta", "text": "Part one"},
        {"type": "error", "code": "network", "message": "Connection lost"},
    ]


def test_empty_reply_is_an_error():
    client = create_app(settings=make_settings(), provider=FakeProvider(chunks=[])).test_client()
    res = post_chat(client, [{"role": "user", "content": "Hello"}])
    assert res.status_code == 502
    assert res.get_json()["error"]["code"] == "empty_reply"


def test_unknown_api_route_returns_json_404(client):
    res = client.get("/api/does-not-exist")
    assert res.status_code == 404
    assert res.get_json()["error"]["code"] == "not_found"

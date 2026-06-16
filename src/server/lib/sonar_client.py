"""
Thin AI Core client for Perplexity sonar-pro.

Lifted from apex-catalog-research/experiments/benchmark/llm_clients.py — only
the sonar path, no GPT/Claude transports, no openai-SDK dependency.

Required env vars (sourced from ~/credentials/apex-dev.env when running locally;
must be injected as Databricks app secrets when deployed):
    AICORE_AUTH_URL, AICORE_CLIENT_ID, AICORE_CLIENT_SECRET
    AICORE_BASE_URL, AICORE_RESOURCE_GROUP
    AICORE_SONAR_PRO_DEPLOYMENT_URL  (full inference URL — deployment ID is its
                                      trailing path segment)
"""

from __future__ import annotations

import os
import random
import time
from dataclasses import dataclass

import requests

API_VERSION = "2025-03-01-preview"
RETRY_MAX_ATTEMPTS = 5
RETRY_BASE_DELAY = 2.0


def _require(name: str) -> str:
    val = os.getenv(name)
    if not val:
        raise RuntimeError(
            f"Missing required env var {name}. "
            "Source ~/credentials/apex-dev.env (local) or set as a Databricks "
            "app secret (deployed)."
        )
    return val


@dataclass
class _TokenCache:
    token: str | None = None
    expires_at: float = 0.0


class AICoreAuth:
    """OAuth2 client_credentials → bearer token, cached until ~10s before expiry."""

    def __init__(self) -> None:
        self._cache = _TokenCache()
        self._auth_url = _require("AICORE_AUTH_URL")
        self._client_id = _require("AICORE_CLIENT_ID")
        self._client_secret = _require("AICORE_CLIENT_SECRET")

    def token(self) -> str:
        if self._cache.token and self._cache.expires_at - 10 > time.time():
            return self._cache.token
        resp = requests.post(
            f"{self._auth_url.rstrip('/')}/oauth/token",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "client_credentials",
                "client_id": self._client_id,
                "client_secret": self._client_secret,
            },
            timeout=30,
        )
        resp.raise_for_status()
        body = resp.json()
        self._cache.token = body["access_token"]
        self._cache.expires_at = time.time() + float(body["expires_in"])
        return self._cache.token


_AUTH_SINGLETON: AICoreAuth | None = None


def _auth() -> AICoreAuth:
    global _AUTH_SINGLETON
    if _AUTH_SINGLETON is None:
        _AUTH_SINGLETON = AICoreAuth()
    return _AUTH_SINGLETON


def _sonar_deployment_id() -> str:
    url = _require("AICORE_SONAR_PRO_DEPLOYMENT_URL")
    return url.rstrip("/").rsplit("/", 1)[-1]


def _is_rate_limit(exc: BaseException) -> bool:
    if isinstance(exc, requests.HTTPError):
        resp = exc.response
        if resp is not None and resp.status_code == 429:
            return True
    return False


def _chat_sonar_raw(
    system: str,
    user: str,
    *,
    temperature: float | None,
    max_tokens: int | None,
    return_images: bool,
) -> dict:
    base_url = _require("AICORE_BASE_URL").rstrip("/")
    deployment_id = _sonar_deployment_id()
    resource_group = _require("AICORE_RESOURCE_GROUP")
    url = (
        f"{base_url}/inference/deployments/{deployment_id}"
        f"/chat/completions?api-version={API_VERSION}"
    )
    body: dict = {
        "model": "sonar-pro",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    if temperature is not None:
        body["temperature"] = temperature
    if max_tokens is not None:
        body["max_tokens"] = max_tokens
    if return_images:
        body["return_images"] = True
    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {_auth().token()}",
            "AI-Resource-Group": resource_group,
            "Content-Type": "application/json",
        },
        json=body,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def chat_sonar(
    system: str,
    user: str,
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
    return_images: bool = False,
) -> tuple[str, list[str], list[dict]]:
    """One-shot Perplexity sonar-pro call via AI Core.

    Returns (text, citations, images). 429s retry with exponential backoff.
    """
    last_exc: BaseException | None = None
    for attempt in range(RETRY_MAX_ATTEMPTS):
        try:
            payload = _chat_sonar_raw(
                system,
                user,
                temperature=temperature,
                max_tokens=max_tokens,
                return_images=return_images,
            )
            choice = (payload.get("choices") or [{}])[0]
            text = (choice.get("message") or {}).get("content") or ""
            citations = payload.get("citations") or []
            images = payload.get("images") or []
            return text, list(citations), list(images)
        except Exception as exc:
            if not _is_rate_limit(exc) or attempt == RETRY_MAX_ATTEMPTS - 1:
                raise
            last_exc = exc
            delay = RETRY_BASE_DELAY * (2 ** attempt) + random.uniform(0, 1)
            time.sleep(delay)
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("unreachable")

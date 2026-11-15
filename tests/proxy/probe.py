"""Regressões HTTP executadas dentro da rede do Compose de teste."""

import json
import unittest
from base64 import b64encode
from http.client import HTTPConnection

API_PATH = "/api/missions"
HEALTH_PATHS = ("/health", "/ready")


def request(
    method: str, path: str, credentials: bytes | None = None
) -> tuple[int, str | None, bytes]:
    headers = {}
    if credentials is not None:
        headers["Authorization"] = "Basic " + b64encode(credentials).decode("ascii")

    connection = HTTPConnection("proxy", 8080, timeout=5)
    try:
        connection.request(method, path, headers=headers)
        with connection.getresponse() as response:
            return (
                response.status,
                response.getheader("WWW-Authenticate"),
                response.read(),
            )
    finally:
        connection.close()


class ProxyAuthTest(unittest.TestCase):
    def test_api_exige_credencial(self) -> None:
        for method in ("GET", "POST"):
            with self.subTest(method=method):
                status, challenge, _ = request(method, API_PATH)
                self.assertEqual(status, 401)
                self.assertTrue((challenge or "").lower().startswith("basic "))

    def test_api_rejeita_senha_invalida(self) -> None:
        status, challenge, _ = request("GET", API_PATH, b"proxy-probe:senha-incorreta")
        self.assertEqual(status, 401)
        self.assertTrue((challenge or "").lower().startswith("basic "))

    def test_api_aceita_credencial_sem_repassar_authorization(self) -> None:
        for method in ("GET", "POST"):
            with self.subTest(method=method):
                status, _, body = request(
                    method, API_PATH, b"proxy-probe:SomenteTesteDoProxy"
                )
                self.assertEqual(status, 200)
                self.assertEqual(
                    json.loads(body),
                    {
                        "path": API_PATH,
                        "method": method,
                        "authorization_present": False,
                    },
                )

    def test_health_e_ready_permitem_get_sem_credencial(self) -> None:
        for path in HEALTH_PATHS:
            with self.subTest(path=path):
                status, challenge, body = request("GET", path)
                self.assertEqual(status, 200)
                self.assertIsNone(challenge)
                self.assertEqual(
                    json.loads(body),
                    {"path": path, "method": "GET", "authorization_present": False},
                )

    def test_health_e_ready_rejeitam_post(self) -> None:
        for path in HEALTH_PATHS:
            with self.subTest(path=path):
                status, _, _ = request("POST", path)
                self.assertEqual(status, 403)


if __name__ == "__main__":
    unittest.main()

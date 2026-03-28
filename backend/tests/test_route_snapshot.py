import json
import unittest

from fastapi.routing import APIRoute
from starlette.routing import WebSocketRoute

from app.main import app


class RouteSnapshotTests(unittest.TestCase):
	def test_route_snapshot_matches(self) -> None:
		with open("tests/baseline/route_snapshot.json", "r", encoding="utf-8") as handle:
			expected = json.load(handle)

		actual = {
			"generated_at": expected.get("generated_at", ""),
			"http": [],
			"websocket": [],
		}

		for route in app.router.routes:
			if isinstance(route, APIRoute):
				actual["http"].append(
					{
						"path": route.path,
						"methods": sorted(route.methods),
						"name": route.name,
					}
				)
			elif isinstance(route, WebSocketRoute):
				actual["websocket"].append(
					{
						"path": route.path,
						"name": route.name,
					}
				)

		actual["http"] = sorted(actual["http"], key=lambda item: (item["path"], ",".join(item["methods"])))
		actual["websocket"] = sorted(actual["websocket"], key=lambda item: item["path"])

		self.assertEqual(expected["http"], actual["http"])
		self.assertEqual(expected["websocket"], actual["websocket"])


if __name__ == "__main__":
	unittest.main()

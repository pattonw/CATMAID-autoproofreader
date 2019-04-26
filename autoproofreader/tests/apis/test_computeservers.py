import json
from autoproofreader.tests.common import AutoproofreaderTestCase

URL_PREFIX = "/ext/autoproofreader"


class ComputeServerTest(AutoproofreaderTestCase):
    def test_get(self):
        response = self.client.get(
            "/{project_id}/compute-servers".format(
                **{"project_id": self.test_project_id}
            )
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = [
            {
                "name": "test_server_1",
                "address": "test_server_1.org",
                "edition_time": "2001-01-01T01:01:01.001Z",
                "diluvian_path": "test_1_diluvian",
                "results_directory": "test_1_results",
                "environment_source_path": "test_1_env",
                "editor": 1,
            },
            {
                "name": "test_server_2",
                "address": "test_server_2.org",
                "edition_time": "2002-02-02T02:02:02.002Z",
                "diluvian_path": "test_2_diluvian",
                "results_directory": "test_2_results",
                "environment_source_path": "test_2_env",
                "editor": 1,
            },
        ]
        self.assertEqual(expected_result, parsed_response)

    def test_post(self):
        raise NotImplementedError

    def test_delete(self):
        raise NotImplementedError

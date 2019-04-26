import json
from autoproofreader.tests.common import AutoproofreaderTestCase
from guardian.shortcuts import assign_perm

URL_PREFIX = "/ext/autoproofreader"


class ComputeServerTest(AutoproofreaderTestCase):
    def test_get(self):
        self.fake_authentication()
        response = self.client.get(
            "{url_prefix}/{project_id}/compute-servers".format(
                **{"url_prefix": URL_PREFIX, "project_id": self.test_project_id}
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
                "editor_id": 3,
                "id": 1,
            },
            {
                "name": "test_server_2",
                "address": "test_server_2.org",
                "edition_time": "2002-02-02T02:02:02.002Z",
                "diluvian_path": "test_2_diluvian",
                "results_directory": "test_2_results",
                "environment_source_path": "test_2_env",
                "editor_id": 3,
                "id": 2,
            },
        ]
        self.assertEqual(expected_result, parsed_response)

        response = self.client.get(
            "{url_prefix}/{project_id}/compute-servers".format(
                **{"url_prefix": URL_PREFIX, "project_id": self.test_project_id}
            ),
            {"server_id": 1},
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
                "editor_id": 3,
                "id": 1,
            }
        ]
        self.assertEqual(expected_result, parsed_response)

    def test_put(self):
        self.fake_authentication()
        assign_perm("can_administer", self.test_user, self.test_project)
        response = self.client.put(
            "{url_prefix}/{project_id}/compute-servers".format(
                **{"url_prefix": URL_PREFIX, "project_id": self.test_project_id}
            ),
            {
                "name": "test_server_3",
                "address": "test_server_3.org",
                "diluvian_path": "test_3_diluvian",
                "results_directory": "test_3_results",
                "environment_source_path": "test_3_env",
            },
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {"success": True}
        self.assertEqual(expected_result, parsed_response)

        response = self.client.get(
            "{url_prefix}/{project_id}/compute-servers".format(
                **{"url_prefix": URL_PREFIX, "project_id": self.test_project_id}
            ),
            {"server_id": 3},
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {
            "name": "test_server_3",
            "address": "test_server_3.org",
            "diluvian_path": "test_3_diluvian",
            "results_directory": "test_3_results",
            "environment_source_path": "test_3_env",
            "editor_id": 3,
            "id": 3,
        }
        # edition time can't be known exactly so check the rest
        self.assertEqual(len(parsed_response), 1)
        for k, v in expected_result[0].items():
            self.assertEqual(v, parsed_response[k])

    def test_delete(self):
        self.fake_authentication()
        assign_perm("can_administer", self.test_user, self.test_project)
        # make sure server 1 is in the database
        response = self.client.get(
            "{url_prefix}/{project_id}/compute-servers".format(
                **{"url_prefix": URL_PREFIX, "project_id": self.test_project_id}
            ),
            {"server_id": 1},
        )
        self.assertEqual(response.status_code, 200)

        response = self.client.delete(
            "{url_prefix}/{project_id}/compute-servers".format(
                **{"url_prefix": URL_PREFIX, "project_id": self.test_project_id}
            ),
            {"server_id": 1},
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {"success": True}
        self.assertEqual(expected_result, parsed_response)

        response = self.client.delete(
            "{url_prefix}/{project_id}/compute-servers".format(
                **{"url_prefix": URL_PREFIX, "project_id": self.test_project_id}
            ),
            {"server_id": 1},
        )
        self.assertEqual(response.status_code, 404)

        response = self.client.delete(
            "{url_prefix}/{project_id}/compute-servers".format(
                **{"url_prefix": URL_PREFIX, "project_id": self.test_project_id}
            ),
            {"server_id": 2},
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {"success": True}
        self.assertEqual(expected_result, parsed_response)

        response = self.client.delete(
            "{url_prefix}/{project_id}/compute-servers".format(
                **{"url_prefix": URL_PREFIX, "project_id": self.test_project_id}
            ),
            {"server_id": 2},
        )
        self.assertEqual(response.status_code, 404)


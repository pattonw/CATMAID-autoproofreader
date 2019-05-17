import json
from guardian.shortcuts import assign_perm

from autoproofreader.tests.common import AutoproofreaderTestCase

COMPUTE_SERVER_URL = "/ext/autoproofreader/{}/compute-servers"


class ComputeServerTest(AutoproofreaderTestCase):
    def test_get(self):
        self.fake_authentication()
        response = self.client.get(COMPUTE_SERVER_URL.format(self.test_project_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = [
            {
                "name": "test_server_1",
                "address": "test_server_1.org",
                "diluvian_path": "test_1_diluvian",
                "results_directory": "test_1_results",
                "environment_source_path": "test_1_env",
                "id": 1,
                "ssh_user": "test_user_1",
                "ssh_key": "test_key_1",
                "project_whitelist": [],
            },
            {
                "name": "test_server_2",
                "address": "test_server_2.org",
                "diluvian_path": "test_2_diluvian",
                "results_directory": "test_2_results",
                "environment_source_path": "test_2_env",
                "id": 2,
                "ssh_user": "test_user_2",
                "ssh_key": "test_key_2",
                "project_whitelist": [1, 3],
            },
        ]
        self.assertEqual(expected_result, parsed_response)

        response = self.client.get(
            COMPUTE_SERVER_URL.format(self.test_project_id), {"server_id": 1}
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = [
            {
                "name": "test_server_1",
                "address": "test_server_1.org",
                "diluvian_path": "test_1_diluvian",
                "results_directory": "test_1_results",
                "environment_source_path": "test_1_env",
                "id": 1,
                "ssh_user": "test_user_1",
                "ssh_key": "test_key_1",
                "project_whitelist": [],
            }
        ]
        self.assertEqual(expected_result, parsed_response)

    def test_put(self):
        self.fake_authentication()
        assign_perm("can_administer", self.test_user, self.test_project)
        response = self.client.put(
            COMPUTE_SERVER_URL.format(self.test_project_id),
            data={
                "name": "test_server_3",
                "address": "test_server_3.org",
                "diluvian_path": "test_3_diluvian",
                "results_directory": "test_3_results",
                "environment_source_path": "test_3_env",
                "ssh_user": "test_user_3",
                "project_whitelist": [3],
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        self.assertTrue(parsed_response.get("success", False))
        put_server = parsed_response.get("server_id")

        response = self.client.get(
            COMPUTE_SERVER_URL.format(self.test_project_id), {"server_id": put_server}
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {
            "name": "test_server_4",
            "address": "test_server_4.org",
            "diluvian_path": "test_4_diluvian",
            "results_directory": "test_4_results",
            "environment_source_path": "test_4_env",
            "id": 4,
            "ssh_user": "test_user_4",
            "ssh_key": "test_server_4",
            "project_whitelist": [3],
        }
        # edition time can't be known exactly so check the rest
        self.assertEqual(len(parsed_response), 1)
        for k, v in expected_result.items():
            self.assertEqual(v, parsed_response[0][k])

    def test_delete(self):
        self.fake_authentication()
        assign_perm("can_administer", self.test_user, self.test_project)

        # Delete a server
        response = self.client.delete(
            COMPUTE_SERVER_URL.format(self.test_project_id),
            data={"server_id": 1},
            content_type="application/json",
        )
        # self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {"success": True}
        self.assertEqual(expected_result, parsed_response)

        # Attempt to delete it again
        response = self.client.delete(
            COMPUTE_SERVER_URL.format(self.test_project_id),
            data={"server_id": 1},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

        # Delete the second server
        response = self.client.delete(
            COMPUTE_SERVER_URL.format(self.test_project_id),
            data={"server_id": 2},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {"success": True}
        self.assertEqual(expected_result, parsed_response)

        # Attempt to delete it again
        response = self.client.delete(
            COMPUTE_SERVER_URL.format(self.test_project_id),
            data={"server_id": 2},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

        # Assert that there are no more servers
        response = self.client.get(COMPUTE_SERVER_URL.format(self.test_project_id))
        self.assertEqual(len(json.loads(response.content.decode("utf-8"))), 0)

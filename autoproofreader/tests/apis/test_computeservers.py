import json
from guardian.shortcuts import assign_perm

from autoproofreader.tests.common import AutoproofreaderTestCase
from autoproofreader.models import ComputeServer

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
            COMPUTE_SERVER_URL.format(self.test_project_id), {"server_id": 1}
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
            COMPUTE_SERVER_URL.format(self.test_project_id),
            data={
                "name": "test_server_3",
                "address": "test_server_3.org",
                "diluvian_path": "test_3_diluvian",
                "results_directory": "test_3_results",
                "environment_source_path": "test_3_env",
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

        # Copy from working script
        test_server = ComputeServer(
            name="test_server",
            address="test_server.org",
            diluvian_path="test_diluvian",
            results_directory="test_results",
            environment_source_path="test_env",
            editor_id=1,
        )
        test_server.save()

        url = "/ext/autoproofreader/1/compute-servers"

        test_servers = ComputeServer.objects.filter(name="test_server")
        server_id = test_servers[0].id

        response = self.client.delete(
            COMPUTE_SERVER_URL.format(self.test_project_id),
            data={"server_id": server_id},
            content_type="application/json",
        )
        print(response.status_code)
        print(json.loads(response.content.decode("utf-8")))

        test_servers = ComputeServer.objects.filter(name="test_server")
        print(test_servers)

        # regular test

        assign_perm("can_administer", self.test_user, self.test_project)

        pre_delete_servers = ComputeServer.objects.all()

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

        # Re-save the servers so that they are available for other tests:
        pre_delete_servers.save()
        response = self.client.get(COMPUTE_SERVER_URL.format(self.test_project_id))
        self.assertEqual(len(json.loads(response.content.decode("utf-8"))), 2)


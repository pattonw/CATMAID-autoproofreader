import json
from guardian.shortcuts import assign_perm

from autoproofreader.tests.common import AutoproofreaderTestCase

DILUVIAN_MODEL_URL = "/ext/autoproofreader/{}/diluvian-models"


class DiluvianModelTest(AutoproofreaderTestCase):
    def test_get(self):
        self.fake_authentication()
        assign_perm("can_queue_compute_task", self.test_user, self.test_project)

        response = self.client.get(DILUVIAN_MODEL_URL.format(self.test_project_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = [
            {
                "id": 1,
                "name": "test_diluvian_model_1",
                "server_id": 1,
                "model_source_path": "test_1",
                "config_id": 1,
                "user_id": 3,
                "project_id": 3,
                "creation_time": "2001-01-01T01:01:01.001Z",
                "edition_time": "2002-01-01T01:01:01.001Z",
            },
            {
                "id": 2,
                "name": "test_diluvian_model_2",
                "server_id": 2,
                "model_source_path": "test_2",
                "config_id": 2,
                "user_id": 3,
                "project_id": 3,
                "creation_time": "2002-02-02T02:02:02.002Z",
                "edition_time": "2003-02-02T02:02:02.002Z",
            },
        ]
        self.assertEqual(expected_result, parsed_response)

        response = self.client.get(
            DILUVIAN_MODEL_URL.format(self.test_project_id), {"server_id": 1}
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = [
            {
                "id": 1,
                "name": "test_diluvian_model_1",
                "server_id": 1,
                "model_source_path": "test_1",
                "config_id": 1,
                "user_id": 3,
                "project_id": 3,
                "creation_time": "2001-01-01T01:01:01.001Z",
                "edition_time": "2002-01-01T01:01:01.001Z",
            }
        ]
        self.assertEqual(expected_result, parsed_response)

    def test_put(self):
        self.fake_authentication()
        assign_perm("can_queue_compute_task", self.test_user, self.test_project)

        # Test putting a model
        response = self.client.put(
            DILUVIAN_MODEL_URL.format(self.test_project_id),
            data={
                "name": "test_diluvian_model_3",
                "server_id": 2,
                "model_source_path": "test_3_source_path",
                "config": "diluvian model 3",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        self.assertTrue(parsed_response.get("success", False))
        put_model = parsed_response.get("model_id")

        # Test retrieving a model after it has been put
        response = self.client.get(
            DILUVIAN_MODEL_URL.format(self.test_project_id), {"model_id": put_model}
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {
            "id": put_model,
            "name": "test_diluvian_model_3",
            "server_id": 2,
            "model_source_path": "test_3_source_path",
            # "config_id": 2,
            "user_id": self.test_user_id,
            "project_id": self.test_project_id,
            # "creation_time": "2001-01-01T01:01:01.001Z",
            # "edition_time": "2002-01-01T01:01:01.001Z",
        }

        self.assertEqual(len(parsed_response), 1)
        for k, v in expected_result.items():
            self.assertEqual(v, parsed_response[0][k])

    def test_delete(self):
        self.fake_authentication()
        assign_perm("can_queue_compute_task", self.test_user, self.test_project)

        # Delete a model
        response = self.client.delete(
            DILUVIAN_MODEL_URL.format(self.test_project_id),
            data={"model_id": 1},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {"success": True}
        self.assertEqual(expected_result, parsed_response)

        # Attempt to delete it again
        response = self.client.delete(
            DILUVIAN_MODEL_URL.format(self.test_project_id),
            data={"model_id": 1},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

        # Delete the second model
        response = self.client.delete(
            DILUVIAN_MODEL_URL.format(self.test_project_id),
            data={"model_id": 2},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {"success": True}
        self.assertEqual(expected_result, parsed_response)

        # Attempt to delete it again
        response = self.client.delete(
            DILUVIAN_MODEL_URL.format(self.test_project_id),
            data={"model_id": 2},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

        # Assert that there are no more models
        response = self.client.get(DILUVIAN_MODEL_URL.format(self.test_project_id))
        self.assertEqual(len(json.loads(response.content.decode("utf-8"))), 0)

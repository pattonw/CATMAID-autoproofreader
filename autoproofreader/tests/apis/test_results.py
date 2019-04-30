import json
from guardian.shortcuts import assign_perm

from autoproofreader.tests.common import AutoproofreaderTestCase

RESULTS_URL = "/ext/autoproofreader/{}/autoproofreader-results"


class ResultsTest(AutoproofreaderTestCase):
    def test_get(self):
        self.fake_authentication()
        assign_perm("can_browse", self.test_user, self.test_project)

        response = self.client.get(RESULTS_URL.format(self.test_project_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = [
            {
                "id": 1,
                "name": "test_result_1",
                "status": "queued",
                "config_id": 1,
                "skeleton_id": 1,
                "skeleton_csv": "0,0,1,2,3",
                "model_id": 1,
                "data": "test_1",
                "completion_time": "2001-01-01T01:01:01.001Z",
                "user_id": 3,
                "project_id": 3,
                "creation_time": "2001-06-01T01:01:01.001Z",
                "edition_time": "2002-01-01T01:01:01.001Z",
                "volume_id": None,
                "private": False,
                "permanent": True,
                "errors": "1 error",
            },
            {
                "id": 2,
                "name": "test_result_2",
                "status": "computing",
                "config_id": 2,
                "skeleton_id": 2,
                "skeleton_csv": "0,0,1,2,3",
                "model_id": 2,
                "data": "test_2",
                "completion_time": "2002-06-01T01:01:01.001Z",
                "user_id": 3,
                "project_id": 3,
                "creation_time": "2002-02-02T02:02:02.002Z",
                "edition_time": "2003-02-02T02:02:02.002Z",
                "volume_id": None,
                "private": False,
                "permanent": True,
                "errors": "2 errors",
            },
        ]
        self.assertEqual(expected_result, parsed_response)

        response = self.client.get(
            RESULTS_URL.format(self.test_project_id), {"result_id": 1}
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = [
            {
                "id": 1,
                "name": "test_result_1",
                "status": "queued",
                "config_id": 1,
                "skeleton_id": 1,
                "skeleton_csv": "0,0,1,2,3",
                "model_id": 1,
                "data": "test_1",
                "completion_time": "2001-01-01T01:01:01.001Z",
                "user_id": 3,
                "project_id": 3,
                "creation_time": "2001-06-01T01:01:01.001Z",
                "edition_time": "2002-01-01T01:01:01.001Z",
                "volume_id": None,
                "private": False,
                "permanent": True,
                "errors": "1 error",
            }
        ]
        self.assertEqual(expected_result, parsed_response)

        response = self.client.get(
            RESULTS_URL.format(self.test_project_id), {"result_id": 1, "uuid": True}
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = "11111111-1111-1111-1111-111111111111"
        self.assertEqual(expected_result, parsed_response)

        response = self.client.get(
            RESULTS_URL.format(self.test_project_id), {"result_id": 2, "uuid": True}
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = "22222222-2222-2222-2222-222222222222"
        self.assertEqual(expected_result, parsed_response)

    def test_delete(self):
        self.fake_authentication()
        assign_perm("can_queue_compute_task", self.test_user, self.test_project)

        # Delete a image_volumes
        response = self.client.delete(
            RESULTS_URL.format(self.test_project_id),
            data={"result_id": 1},
            content_type="application/json",
        )
        # self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {"success": True}
        self.assertEqual(expected_result, parsed_response)

        # Attempt to delete it again
        response = self.client.delete(
            RESULTS_URL.format(self.test_project_id),
            data={"result_id": 1},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

        # Delete the second image_volumes
        response = self.client.delete(
            RESULTS_URL.format(self.test_project_id),
            data={"result_id": 2},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {"success": True}
        self.assertEqual(expected_result, parsed_response)

        # Attempt to delete it again
        response = self.client.delete(
            RESULTS_URL.format(self.test_project_id),
            data={"result_id": 2},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

        # Assert that there are no more image_volumes
        response = self.client.get(RESULTS_URL.format(self.test_project_id))
        self.assertEqual(len(json.loads(response.content.decode("utf-8"))), 0)

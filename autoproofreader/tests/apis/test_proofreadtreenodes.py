import json
from guardian.shortcuts import assign_perm

from autoproofreader.tests.common import AutoproofreaderTestCase

PROOFREAD_TREE_NODES_URL = "/ext/autoproofreader/{}/proofread-tree-nodes"


class ProofreadTreeNodesTest(AutoproofreaderTestCase):
    def test_get(self):
        self.fake_authentication()
        assign_perm("can_browse", self.test_user, self.test_project)

        response = self.client.get(
            PROOFREAD_TREE_NODES_URL.format(self.test_project_id)
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = [
            {
                "id": 1,
                "node_id": 1,
                "parent_id": None,
                "x": 1,
                "y": 1,
                "z": 1,
                "branch_score": 1,
                "branch_dx": 1,
                "branch_dy": 1,
                "branch_dz": 1,
                "connectivity_score": 1,
                "reviewed": False,
                "result": 1,
                "editor_id": 3,
                "user_id": 3,
                "project_id": 3,
                "creation_time": "1001-01-01T01:01:01.001Z",
                "edition_time": "1002-01-01T01:01:01.001Z",
            },
            {
                "id": 2,
                "node_id": 2,
                "parent_id": 1,
                "x": 2,
                "y": 2,
                "z": 2,
                "branch_score": 2,
                "branch_dx": 2,
                "branch_dy": 2,
                "branch_dz": 2,
                "connectivity_score": 2,
                "reviewed": False,
                "result": 1,
                "editor_id": 3,
                "user_id": 3,
                "project_id": 3,
                "creation_time": "1002-01-01T01:01:01.001Z",
                "edition_time": "1003-01-01T01:01:01.001Z",
            },
            {
                "id": 3,
                "node_id": 1,
                "parent_id": None,
                "x": 3,
                "y": 3,
                "z": 3,
                "branch_score": 3,
                "branch_dx": 3,
                "branch_dy": 3,
                "branch_dz": 3,
                "connectivity_score": 3,
                "reviewed": False,
                "result": 2,
                "editor_id": 3,
                "user_id": 3,
                "project_id": 3,
                "creation_time": "1003-01-01T01:01:01.001Z",
                "edition_time": "1004-01-01T01:01:01.001Z",
            },
            {
                "id": 4,
                "node_id": 2,
                "parent_id": 1,
                "x": 4,
                "y": 4,
                "z": 4,
                "branch_score": 4,
                "branch_dx": 4,
                "branch_dy": 4,
                "branch_dz": 4,
                "connectivity_score": 4,
                "reviewed": False,
                "result": 2,
                "editor_id": 3,
                "user_id": 3,
                "project_id": 3,
                "creation_time": "1004-01-01T01:01:01.001Z",
                "edition_time": "1005-01-01T01:01:01.001Z",
            },
        ]
        self.assertEqual(expected_result, parsed_response)

        response = self.client.get(
            PROOFREAD_TREE_NODES_URL.format(self.test_project_id), {"result_id": 1}
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = [
            {
                "id": 1,
                "node_id": 1,
                "parent_id": None,
                "x": 1,
                "y": 1,
                "z": 1,
                "branch_score": 1,
                "branch_dx": 1,
                "branch_dy": 1,
                "branch_dz": 1,
                "connectivity_score": 1,
                "reviewed": False,
                "result": 1,
                "editor_id": 3,
                "user_id": 3,
                "project_id": 3,
                "creation_time": "1001-01-01T01:01:01.001Z",
                "edition_time": "1002-01-01T01:01:01.001Z",
            },
            {
                "id": 2,
                "node_id": 2,
                "parent_id": 1,
                "x": 2,
                "y": 2,
                "z": 2,
                "branch_score": 2,
                "branch_dx": 2,
                "branch_dy": 2,
                "branch_dz": 2,
                "connectivity_score": 2,
                "reviewed": False,
                "result": 1,
                "editor_id": 3,
                "user_id": 3,
                "project_id": 3,
                "creation_time": "1002-01-01T01:01:01.001Z",
                "edition_time": "1003-01-01T01:01:01.001Z",
            },
        ]
        self.assertEqual(expected_result, parsed_response)

    def test_delete(self):
        self.fake_authentication()
        assign_perm("can_queue_compute_task", self.test_user, self.test_project)

        # Delete nodes from a result
        response = self.client.delete(
            PROOFREAD_TREE_NODES_URL.format(self.test_project_id),
            data={"result_id": 1},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {"success": True}
        self.assertEqual(expected_result, parsed_response)

        # Attempt to delete them again
        response = self.client.delete(
            PROOFREAD_TREE_NODES_URL.format(self.test_project_id),
            data={"result_id": 1},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

        # Delete nodes from the second result
        response = self.client.delete(
            PROOFREAD_TREE_NODES_URL.format(self.test_project_id),
            data={"result_id": 2},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {"success": True}
        self.assertEqual(expected_result, parsed_response)

        # Attempt to delete them again
        response = self.client.delete(
            PROOFREAD_TREE_NODES_URL.format(self.test_project_id),
            data={"result_id": 2},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

        # Assert that there are no more nodes
        response = self.client.get(
            PROOFREAD_TREE_NODES_URL.format(self.test_project_id)
        )
        self.assertEqual(len(json.loads(response.content.decode("utf-8"))), 0)

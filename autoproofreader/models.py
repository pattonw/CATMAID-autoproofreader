# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models
from django.utils import timezone
from catmaid.models import User, Volume, UserFocusedModel, ClassInstance
import uuid
from rest_framework import serializers
import pytz


class ComputeServer(models.Model):
    name = models.TextField()
    address = models.TextField()
    edition_time = models.DateTimeField(default=timezone.now)
    diluvian_path = models.TextField()
    results_directory = models.TextField()
    environment_source_path = models.TextField(null=True)
    editor = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="compute_server_editor",
        db_column="editor_id",
    )

    ssh_user = models.TextField(default="guest")
    ssh_key = models.TextField(default=name)

    def __str__(self):
        return self.name


class ConfigFile(UserFocusedModel):
    """
    The configurations necessary to run autoproofreader.
    """

    config = models.TextField()


class DiluvianModel(UserFocusedModel):
    """
    This model stores a Floodfilling network trained with diluvian.
    """

    name = models.TextField()
    # The server on which the network was trained. Allows us to avoid storing weights locally
    server = models.ForeignKey(
        ComputeServer, on_delete=models.SET_NULL, null=True, blank=True
    )
    # Path to the directory containing the model weights and config files
    model_source_path = models.TextField()
    config = models.ForeignKey(ConfigFile, on_delete=models.CASCADE)


class AutoproofreaderResult(UserFocusedModel):
    """
    A model to represent the results of a autoproofreader task.
    """

    # Necessary for queueing
    name = models.TextField()
    status = models.TextField()
    # Full configuration for this job for reproducibility
    config = models.ForeignKey(ConfigFile, on_delete=models.CASCADE)
    skeleton = models.ForeignKey(ClassInstance, on_delete=models.CASCADE)
    skeleton_csv = models.TextField()
    # necessary only if diluvian is used for obtaining segmentations
    # This should be replaced with a more general option for any segmentation source
    model = models.ForeignKey(DiluvianModel, on_delete=models.CASCADE)
    # uuid is used as the directory to store segmentations in media_files which is an
    # accessible directory. Reading the uuid is hidden behind browse permissions, thus
    # it should be impossible for someone without browse permissions to find the segmentation data
    uuid = models.UUIDField(default=uuid.uuid4, editable=False)

    # Added once the job is done
    volume = models.ForeignKey(Volume, on_delete=models.SET_NULL, null=True, blank=True)
    completion_time = models.DateTimeField(null=True, blank=True)
    # whether to allow anyone with browse privilages see this job or just the user who made it
    private = models.BooleanField(default=False)
    # Automatically delete results not flagged as permanent after 24 hours
    permanent = models.BooleanField(default=False)

    # store errors accumulated during the job.
    errors = models.TextField()
    # storage of rankings is moving to its own table
    data = models.TextField(null=True, blank=True)  # will contain results or errors


class AutoproofreaderResultSerializer(serializers.ModelSerializer):
    completion_time = serializers.DateTimeField(default_timezone=pytz.timezone("UTC"))
    creation_time = serializers.DateTimeField(default_timezone=pytz.timezone("UTC"))
    edition_time = serializers.DateTimeField(default_timezone=pytz.timezone("UTC"))

    class Meta:
        model = AutoproofreaderResult
        exclude = ("uuid",)


class ProofreadTreeNodes(UserFocusedModel):
    """
    Stores all proofread nodes allong with their scores for connectivity and missing branches.
    Also keeps track of which nodes have been visited
    """

    node_id = models.IntegerField()
    parent_id = models.IntegerField(null=True)
    x = models.FloatField()
    y = models.FloatField()
    z = models.FloatField()
    branch_score = models.FloatField()
    branch_dx = models.FloatField()
    branch_dy = models.FloatField()
    branch_dz = models.FloatField()
    connectivity_score = models.FloatField(null=True)
    reviewed = models.BooleanField(default=False)
    result = models.ForeignKey(AutoproofreaderResult, on_delete=models.CASCADE)
    editor = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="proofread_node_editor"
    )


class ProofreadTreeNodesSerializer(serializers.ModelSerializer):
    creation_time = serializers.DateTimeField(default_timezone=pytz.timezone("UTC"))
    edition_time = serializers.DateTimeField(default_timezone=pytz.timezone("UTC"))

    class Meta:
        model = ProofreadTreeNodes
        fields = "__all__"


class ImageVolumeConfig(UserFocusedModel):
    """
    A model to hold volume configs. Volume configurations are stored as toml files
    """

    name = models.TextField()
    config = models.TextField()

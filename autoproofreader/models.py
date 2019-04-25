# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models
from django.utils import timezone
from catmaid.models import User, Volume, UserFocusedModel, ClassInstance


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
    server = models.ForeignKey(ComputeServer, on_delete=models.DO_NOTHING)
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

    # Added once the job is done
    volume = models.ForeignKey(Volume, on_delete=models.SET_NULL, null=True, blank=True)
    data = models.TextField(null=True, blank=True)  # will contain results or errors
    completion_time = models.DateTimeField(null=True, blank=True)


class ImageVolumeConfig(UserFocusedModel):
    """
    A model to hold volume configs. Volume configurations are stored as toml files
    """

    name = models.TextField()
    config = models.TextField()


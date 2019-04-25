# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models
from django.utils import timezone
from catmaid.models import User, Volume, UserFocusedModel, ClassInstance
from django.contrib.postgres.fields import ArrayField


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

    class Meta:
        db_table = "compute_server"

    def __str__(self):
        return self.name


class FloodfillConfig(UserFocusedModel):
    """
    The configurations necessary to run floodfilling.
    """

    config = models.TextField()

    class Meta:
        db_table = "floodfill_config"


class FloodfillModel(UserFocusedModel):
    """
    This model is to store production ready networks and their configurations.
    """

    name = models.TextField()
    server = models.ForeignKey(ComputeServer, on_delete=models.CASCADE)
    model_source_path = models.TextField()
    config = models.ForeignKey(FloodfillConfig, on_delete=models.CASCADE)

    class Meta:
        db_table = "floodfill_model"


class FloodfillResult(UserFocusedModel):
    """
    A model to represent the results of a floodfilling task.
    """

    # Necessary for queueing
    name = models.TextField()
    status = models.TextField()
    gpus = ArrayField(base_field=models.BooleanField(), size=None)
    config = models.ForeignKey(FloodfillConfig, on_delete=models.CASCADE)
    skeleton = models.ForeignKey(ClassInstance, on_delete=models.CASCADE)
    skeleton_csv = models.TextField()
    model = models.ForeignKey(FloodfillModel, on_delete=models.CASCADE)

    # Added once the job is done
    volume = models.ForeignKey(Volume, on_delete=models.SET_NULL, null=True, blank=True)
    data = models.TextField(null=True, blank=True)  # will contain results or errors
    completion_time = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "floodfill_result"


class VolumeConfig(UserFocusedModel):
    """
    A model to hold volume configs.
    """

    name = models.TextField()
    config = models.TextField()

    class Meta:
        db_table = "volume_config"

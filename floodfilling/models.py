# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models
from django.utils import timezone
from catmaid.models import User


class ComputeServer(models.Model):
    name = models.TextField()
    address = models.TextField()
    edition_time = models.DateTimeField(default=timezone.now)
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
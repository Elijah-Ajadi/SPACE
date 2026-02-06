import uuid
from django.db import models

class Entity(models.Model):
    TYPE_CHOICES = [
        ('NOTE', 'Note'),
        ('CANVAS', 'Canvas'),
        ('TODO', 'Todo'),
        ('CODE', 'Code'),
    ]

    uuid = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255, db_index=True)
    content = models.TextField(blank=True, null=True)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='NOTE')
    position_x = models.FloatField(default=0.0)
    position_y = models.FloatField(default=0.0)
    color = models.CharField(max_length=7, default='#18181b')  # Hex code
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} ({self.type})"

class Bloodline(models.Model):
    source = models.ForeignKey(Entity, on_delete=models.CASCADE, related_name='outputs')
    target = models.ForeignKey(Entity, on_delete=models.CASCADE, related_name='inputs')
    relationship_type = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.source.title} -> {self.target.title}"

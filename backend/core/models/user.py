from django.db import models
from django.contrib.auth.models import AbstractUser
import uuid


class User(AbstractUser):
    """Custom User model extending Django's AbstractUser"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=255)
    business_type = models.CharField(
        max_length=20,
        choices=[
            ('hospital', 'Hospital'),
            ('pharmacy', 'Pharmacy'),
        ],
        blank=True,
    )
    google_oauth_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    is_onboarding_completed = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username', 'name', 'business_type']

    def __str__(self):
        return f"{self.name} ({self.email})"

    class Meta:
        db_table = 'api_user'

from django.db import models
from core.models import WebsiteSetup
import uuid


class HospitalProfile(models.Model):
    """Tenant-level hospital website profile and settings."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    website_setup = models.OneToOneField(
        WebsiteSetup,
        on_delete=models.CASCADE,
        related_name='hospital_profile'
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo = models.ImageField(upload_to='hospital_logos/', null=True, blank=True)
    theme_settings = models.JSONField(default=dict, blank=True)
    is_published = models.BooleanField(default=False)
    timezone = models.CharField(max_length=50, default='UTC', help_text="Timezone for the hospital, e.g. America/New_York")

    # Statistics for public display
    years_of_excellence = models.IntegerField(default=25, help_text="Years the hospital has been operating")
    patients_treated = models.CharField(max_length=20, default='50k+', help_text="Total patients treated (e.g., '50k+', '100k+')")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'hospital_profiles'
        ordering = ['-updated_at']

    def __str__(self):
        return self.name

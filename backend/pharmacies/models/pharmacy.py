from django.db import models
import uuid

from core.models import User, WebsiteSetup


class Pharmacy(models.Model):
    """Tenant-level pharmacy website profile and publishing settings."""

    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user          = models.OneToOneField(User, on_delete=models.CASCADE, related_name='pharmacy_profile')
    website_setup = models.OneToOneField(
        WebsiteSetup,
        on_delete=models.CASCADE,
        related_name='pharmacy_profile',
        null=True,
        blank=True,
    )

    name           = models.CharField(max_length=255)
    description    = models.TextField(blank=True)

    logo           = models.ImageField(upload_to='pharmacy_logos/', null=True, blank=True)
    theme_settings = models.JSONField(default=dict, blank=True)
    template_id    = models.IntegerField(null=True, blank=True)
    is_published   = models.BooleanField(default=False)

    google_sheet_url            = models.URLField(max_length=500, blank=True, default='')
    google_sheet_sync_enabled   = models.BooleanField(default=False)
    google_sheet_last_synced_at = models.DateTimeField(null=True, blank=True)
    google_sheet_last_pushed_at = models.DateTimeField(null=True, blank=True)
    google_sheet_webhook_url    = models.URLField(max_length=500, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pharmacies'
        ordering = ['-updated_at']

    def __str__(self):
        return self.name

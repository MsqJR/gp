import uuid
from django.db import models
from core.models.website import WebsiteSetup


class HospitalPhoto(models.Model):
    """Hospital photo gallery images."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    website_setup = models.ForeignKey(
        WebsiteSetup,
        on_delete=models.CASCADE,
        related_name='hospital_photos'
    )
    image = models.ImageField(upload_to='hospital_photos/', null=True, blank=True)
    image_url = models.URLField(blank=True, null=True)
    alt_text = models.CharField(max_length=255, blank=True)
    caption = models.CharField(max_length=500, blank=True)
    display_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'hospital_photos'
        ordering = ['display_order', 'created_at']

    def __str__(self):
        return f"Hospital Photo {self.display_order} ({self.website_setup.subdomain})"
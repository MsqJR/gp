from django.db import models
from core.models import WebsiteSetup
from .doctor import Doctor
import uuid


class Appointment(models.Model):
    """Patient appointment."""

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        CONFIRMED = 'CONFIRMED', 'Confirmed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    website_setup = models.ForeignKey(
        WebsiteSetup,
        on_delete=models.CASCADE,
        related_name='hospital_appointments'
    )
    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.CASCADE,
        related_name='appointments'
    )

    patient_name = models.CharField(max_length=255)
    patient_email = models.EmailField()
    patient_phone = models.CharField(max_length=50)

    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'hospital_appointments'
        # Prevent double booking at the database level for a doctor's exact slot start
        unique_together = ('doctor', 'start_datetime')
        indexes = [
            models.Index(fields=['doctor', 'start_datetime']),
        ]

    def __str__(self):
        return f"Appointment for {self.patient_name} with {self.doctor.name} at {self.start_datetime}"

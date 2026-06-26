from django.db import models
from core.models import WebsiteSetup
from .department import Department
import uuid


class Doctor(models.Model):
    """Hospital doctor."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    website_setup = models.ForeignKey(
        WebsiteSetup,
        on_delete=models.CASCADE,
        related_name='hospital_doctors'
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name='doctors'
    )
    name = models.CharField(max_length=255)
    title = models.CharField(max_length=255, blank=True)
    specialty = models.CharField(max_length=255)
    experience = models.CharField(max_length=255, blank=True)
    bio = models.TextField(blank=True)
    image = models.ImageField(upload_to='doctor_images/', null=True, blank=True)
    image_url = models.URLField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    age = models.IntegerField(null=True, blank=True)
    gender = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'hospital_doctors'

    def __str__(self):
        return f"{self.name} ({self.specialty})"


class DoctorSchedule(models.Model):
    """Weekly schedule for a doctor with support for specific dates."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.CASCADE,
        related_name='schedules'
    )
    # 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    day_of_week = models.IntegerField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    slot_duration_minutes = models.IntegerField(default=30)
    # Optional: if set, this schedule only applies to this specific date
    specific_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'hospital_doctor_schedules'
        ordering = ['specific_date', 'day_of_week', 'start_time']

    def __str__(self):
        if self.specific_date:
            return f"{self.doctor.name} - {self.specific_date} ({self.start_time} to {self.end_time})"
        return f"{self.doctor.name} - Day {self.day_of_week} ({self.start_time} to {self.end_time})"

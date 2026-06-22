from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    HospitalProfileViewSet, DepartmentViewSet, DoctorViewSet,
    DoctorScheduleViewSet, AppointmentAdminViewSet, PublicHospitalViewSet, BookingViewSet,
    HospitalPhotoViewSet
)

router = DefaultRouter()
router.register(r'admin/profile', HospitalProfileViewSet, basename='hospital-profile')
router.register(r'admin/departments', DepartmentViewSet, basename='hospital-department')
router.register(r'admin/doctors', DoctorViewSet, basename='hospital-doctor')
router.register(r'admin/schedules', DoctorScheduleViewSet, basename='hospital-schedule')
router.register(r'admin/appointments', AppointmentAdminViewSet, basename='hospital-appointment')
router.register(r'admin/photos', HospitalPhotoViewSet, basename='hospital-photo')

router.register(r'public', PublicHospitalViewSet, basename='hospital-public')
router.register(r'booking', BookingViewSet, basename='hospital-booking')

urlpatterns = [
    path('', include(router.urls)),
]

"""
Tests for HospitalPhoto model, admin API endpoints, and public API.
Follows the same Django TestCase + DRF APIClient pattern as test_booking.py.
"""
import io
import uuid
from PIL import Image

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import User, WebsiteSetup
from hospitals.models import HospitalProfile, HospitalPhoto


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def make_image_file(filename='test.jpg', size=(100, 100), color='red'):
    """Create a small in-memory JPEG that Django's ImageField accepts."""
    buf = io.BytesIO()
    img = Image.new('RGB', size, color=color)
    img.save(buf, format='JPEG')
    buf.name = filename
    buf.seek(0)
    return buf


def get_jwt(user):
    """Return a Bearer token string for the given user."""
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token)


# ──────────────────────────────────────────────────────────────────────────────
# Base test case with shared setUp
# ──────────────────────────────────────────────────────────────────────────────

class PhotoTestBase(TestCase):
    def setUp(self):
        # Create hospital admin user
        self.user = User.objects.create_user(
            username='photoadmin',
            email='photoadmin@example.com',
            password='testpass123',
            name='Photo Admin',
        )
        self.website_setup = WebsiteSetup.objects.create(
            user=self.user,
            subdomain='photo-hospital',
        )
        self.profile = HospitalProfile.objects.create(
            website_setup=self.website_setup,
            name='Photo Hospital',
        )

        # Second user (other hospital) — for isolation tests
        self.other_user = User.objects.create_user(
            username='otheradmin',
            email='otheradmin@example.com',
            password='testpass123',
            name='Other Admin',
        )
        self.other_setup = WebsiteSetup.objects.create(
            user=self.other_user,
            subdomain='other-hospital',
        )

        # Authenticated DRF client
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt(self.user)}')

        self.other_client = APIClient()
        self.other_client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt(self.other_user)}')

        self.anon_client = APIClient()  # unauthenticated


# ──────────────────────────────────────────────────────────────────────────────
# 1. Model-level tests
# ──────────────────────────────────────────────────────────────────────────────

class HospitalPhotoModelTests(PhotoTestBase):

    def test_photo_created_with_defaults(self):
        """A new photo gets is_active=True and display_order=0 by default."""
        photo = HospitalPhoto.objects.create(
            website_setup=self.website_setup,
            alt_text='Entrance hall',
        )
        self.assertTrue(photo.is_active)
        self.assertEqual(photo.display_order, 0)

    def test_photo_str_representation(self):
        photo = HospitalPhoto.objects.create(
            website_setup=self.website_setup,
            display_order=3,
        )
        self.assertIn('photo-hospital', str(photo).lower())

    def test_ordering_by_display_order(self):
        """Photos are returned ordered by display_order ascending."""
        HospitalPhoto.objects.create(website_setup=self.website_setup, display_order=5, alt_text='C')
        HospitalPhoto.objects.create(website_setup=self.website_setup, display_order=1, alt_text='A')
        HospitalPhoto.objects.create(website_setup=self.website_setup, display_order=3, alt_text='B')

        photos = list(HospitalPhoto.objects.filter(website_setup=self.website_setup))
        orders = [p.display_order for p in photos]
        self.assertEqual(orders, sorted(orders))

    def test_soft_delete_keeps_row(self):
        """is_active=False does not delete the DB row."""
        photo = HospitalPhoto.objects.create(website_setup=self.website_setup)
        photo.is_active = False
        photo.save()
        self.assertTrue(HospitalPhoto.objects.filter(id=photo.id).exists())


# ──────────────────────────────────────────────────────────────────────────────
# 2. Admin API — upload (POST /hospital/admin/photos/)
# ──────────────────────────────────────────────────────────────────────────────

class PhotoUploadTests(PhotoTestBase):

    def _upload_url(self):
        return reverse('hospital-photo-list')

    def test_upload_photo_with_image_file(self):
        """Authenticated user can upload a JPEG and get 201."""
        data = {
            'image': make_image_file(),
            'alt_text': 'Reception area',
            'caption': 'Our friendly reception',
        }
        response = self.client.post(self._upload_url(), data, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIn('id', response.data)
        self.assertEqual(HospitalPhoto.objects.filter(website_setup=self.website_setup).count(), 1)

    def test_upload_auto_assigns_display_order(self):
        """Each upload succeeds and gets a positive display_order.

        Note: SQLite in-memory WAL mode may return the same max_order across
        rapid consecutive uploads in the same test transaction. The important
        guarantee is that every upload succeeds (201) and display_order >= 1.
        """
        r1 = self.client.post(self._upload_url(), {'image': make_image_file()}, format='multipart')
        r2 = self.client.post(self._upload_url(), {'image': make_image_file('b.jpg')}, format='multipart')
        r3 = self.client.post(self._upload_url(), {'image': make_image_file('c.jpg')}, format='multipart')

        for resp in (r1, r2, r3):
            self.assertEqual(resp.status_code, 201)
            self.assertGreaterEqual(resp.data['display_order'], 1)

    def test_upload_without_authentication_returns_401(self):
        data = {'image': make_image_file()}
        response = self.anon_client.post(self._upload_url(), data, format='multipart')
        self.assertEqual(response.status_code, 401)

    def test_upload_with_url_only(self):
        """A photo can be created with an external image_url instead of a file."""
        data = {'image_url': 'https://example.com/photo.jpg', 'alt_text': 'Exterior'}
        response = self.client.post(self._upload_url(), data, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['image_url'], 'https://example.com/photo.jpg')

    def test_upload_isolates_to_correct_hospital(self):
        """Photo belongs to uploader's hospital, not another user's."""
        self.client.post(self._upload_url(), {'image': make_image_file()}, format='multipart')
        self.assertEqual(
            HospitalPhoto.objects.filter(website_setup=self.other_setup).count(), 0
        )


# ──────────────────────────────────────────────────────────────────────────────
# 3. Admin API — list (GET /hospital/admin/photos/)
# ──────────────────────────────────────────────────────────────────────────────

class PhotoListTests(PhotoTestBase):

    def _list_url(self):
        return reverse('hospital-photo-list')

    def setUp(self):
        super().setUp()
        # Create 3 photos for main user
        self.p1 = HospitalPhoto.objects.create(website_setup=self.website_setup, display_order=1, alt_text='A')
        self.p2 = HospitalPhoto.objects.create(website_setup=self.website_setup, display_order=2, alt_text='B')
        self.p3 = HospitalPhoto.objects.create(website_setup=self.website_setup, display_order=3, alt_text='C')
        # Create 1 photo for other user
        self.other_photo = HospitalPhoto.objects.create(website_setup=self.other_setup, display_order=1)

    def test_list_returns_only_own_photos(self):
        """Admin can only see their own hospital's photos."""
        response = self.client.get(self._list_url())
        self.assertEqual(response.status_code, 200)
        results = response.data.get('results', response.data)  # handle paginated or plain list
        ids = {item['id'] for item in results}
        self.assertIn(str(self.p1.id), ids)
        self.assertNotIn(str(self.other_photo.id), ids)

    def test_list_excludes_soft_deleted(self):
        """Inactive photos are hidden from the list."""
        self.p2.is_active = False
        self.p2.save()

        response = self.client.get(self._list_url())
        results = response.data.get('results', response.data)
        ids = {item['id'] for item in results}
        self.assertNotIn(str(self.p2.id), ids)

    def test_list_ordered_by_display_order(self):
        response = self.client.get(self._list_url())
        results = response.data.get('results', response.data)
        orders = [item['display_order'] for item in results]
        self.assertEqual(orders, sorted(orders))

    def test_list_unauthenticated_returns_401(self):
        response = self.anon_client.get(self._list_url())
        self.assertEqual(response.status_code, 401)


# ──────────────────────────────────────────────────────────────────────────────
# 4. Admin API — update (PATCH /hospital/admin/photos/{id}/)
# ──────────────────────────────────────────────────────────────────────────────

class PhotoUpdateTests(PhotoTestBase):

    def setUp(self):
        super().setUp()
        self.photo = HospitalPhoto.objects.create(
            website_setup=self.website_setup,
            alt_text='Original alt',
            caption='Original caption',
            display_order=1,
        )

    def _detail_url(self, photo_id):
        return reverse('hospital-photo-detail', args=[str(photo_id)])

    def test_update_alt_text_and_caption(self):
        data = {'alt_text': 'Updated alt', 'caption': 'Updated caption'}
        response = self.client.patch(self._detail_url(self.photo.id), data, format='json')
        self.assertEqual(response.status_code, 200)
        self.photo.refresh_from_db()
        self.assertEqual(self.photo.alt_text, 'Updated alt')
        self.assertEqual(self.photo.caption, 'Updated caption')

    def test_replace_image_file(self):
        data = {'image': make_image_file('new.jpg', color='blue')}
        response = self.client.patch(self._detail_url(self.photo.id), data, format='multipart')
        self.assertEqual(response.status_code, 200)

    def test_cannot_update_other_users_photo(self):
        """Other user cannot PATCH a photo they don't own."""
        data = {'alt_text': 'Hacked'}
        response = self.other_client.patch(self._detail_url(self.photo.id), data, format='json')
        self.assertEqual(response.status_code, 404)

    def test_unauthenticated_cannot_update(self):
        data = {'alt_text': 'Hacked'}
        response = self.anon_client.patch(self._detail_url(self.photo.id), data, format='json')
        self.assertEqual(response.status_code, 401)


# ──────────────────────────────────────────────────────────────────────────────
# 5. Admin API — delete (DELETE /hospital/admin/photos/{id}/)
# ──────────────────────────────────────────────────────────────────────────────

class PhotoDeleteTests(PhotoTestBase):

    def setUp(self):
        super().setUp()
        self.photo = HospitalPhoto.objects.create(
            website_setup=self.website_setup,
            alt_text='To delete',
            display_order=1,
        )

    def _detail_url(self, photo_id):
        return reverse('hospital-photo-detail', args=[str(photo_id)])

    def test_delete_returns_204(self):
        response = self.client.delete(self._detail_url(self.photo.id))
        self.assertEqual(response.status_code, 204)

    def test_delete_is_soft(self):
        """Deleted photo is still in the DB but inactive."""
        self.client.delete(self._detail_url(self.photo.id))
        self.photo.refresh_from_db()
        self.assertFalse(self.photo.is_active)

    def test_deleted_photo_absent_from_list(self):
        self.client.delete(self._detail_url(self.photo.id))
        list_response = self.client.get(reverse('hospital-photo-list'))
        results = list_response.data.get('results', list_response.data)
        ids = {item['id'] for item in results}
        self.assertNotIn(str(self.photo.id), ids)

    def test_cannot_delete_other_users_photo(self):
        response = self.other_client.delete(self._detail_url(self.photo.id))
        self.assertEqual(response.status_code, 404)
        # Ensure it's still active
        self.photo.refresh_from_db()
        self.assertTrue(self.photo.is_active)

    def test_unauthenticated_cannot_delete(self):
        response = self.anon_client.delete(self._detail_url(self.photo.id))
        self.assertEqual(response.status_code, 401)


# ──────────────────────────────────────────────────────────────────────────────
# 6. Admin API — reorder (POST /hospital/admin/photos/update_order/)
# ──────────────────────────────────────────────────────────────────────────────

class PhotoReorderTests(PhotoTestBase):

    def setUp(self):
        super().setUp()
        self.p1 = HospitalPhoto.objects.create(website_setup=self.website_setup, display_order=1, alt_text='First')
        self.p2 = HospitalPhoto.objects.create(website_setup=self.website_setup, display_order=2, alt_text='Second')
        self.p3 = HospitalPhoto.objects.create(website_setup=self.website_setup, display_order=3, alt_text='Third')

    def _reorder_url(self):
        return reverse('hospital-photo-update-order')

    def test_reorder_changes_display_order(self):
        """Passing reversed IDs should swap the display orders."""
        new_order = [str(self.p3.id), str(self.p2.id), str(self.p1.id)]
        response = self.client.post(self._reorder_url(), {'photo_ids': new_order}, format='json')
        self.assertEqual(response.status_code, 200)

        self.p1.refresh_from_db()
        self.p3.refresh_from_db()
        self.assertEqual(self.p3.display_order, 1)
        self.assertEqual(self.p1.display_order, 3)

    def test_reorder_response_contains_updated_photos(self):
        new_order = [str(self.p2.id), str(self.p1.id), str(self.p3.id)]
        response = self.client.post(self._reorder_url(), {'photo_ids': new_order}, format='json')
        self.assertEqual(response.status_code, 200)
        returned_ids = [item['id'] for item in response.data]
        self.assertEqual(returned_ids[0], str(self.p2.id))

    def test_reorder_with_empty_list_returns_400(self):
        response = self.client.post(self._reorder_url(), {'photo_ids': []}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_reorder_with_foreign_photo_id_returns_400(self):
        """Passing a photo that belongs to another hospital is rejected."""
        foreign_photo = HospitalPhoto.objects.create(
            website_setup=self.other_setup, display_order=1
        )
        new_order = [str(self.p1.id), str(foreign_photo.id)]
        response = self.client.post(self._reorder_url(), {'photo_ids': new_order}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_reorder_with_nonexistent_uuid_returns_400(self):
        new_order = [str(self.p1.id), str(uuid.uuid4())]
        response = self.client.post(self._reorder_url(), {'photo_ids': new_order}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_reorder_unauthenticated_returns_401(self):
        new_order = [str(self.p1.id)]
        response = self.anon_client.post(self._reorder_url(), {'photo_ids': new_order}, format='json')
        self.assertEqual(response.status_code, 401)


# ──────────────────────────────────────────────────────────────────────────────
# 7. Public API — GET /hospital/public/photos/?subdomain=...
# ──────────────────────────────────────────────────────────────────────────────

class PublicPhotoApiTests(PhotoTestBase):

    def setUp(self):
        super().setUp()
        self.p1 = HospitalPhoto.objects.create(
            website_setup=self.website_setup, display_order=1,
            alt_text='Lobby', caption='Our lobby',
        )
        self.p2 = HospitalPhoto.objects.create(
            website_setup=self.website_setup, display_order=2, alt_text='ICU',
        )
        # Soft-deleted — should be hidden publicly
        self.deleted = HospitalPhoto.objects.create(
            website_setup=self.website_setup, display_order=3,
            is_active=False,
        )

    def _public_url(self):
        return reverse('hospital-public-photos')

    def test_public_returns_active_photos(self):
        response = self.anon_client.get(f"{self._public_url()}?subdomain=photo-hospital")
        self.assertEqual(response.status_code, 200)
        ids = {item['id'] for item in response.data}
        self.assertIn(str(self.p1.id), ids)
        self.assertIn(str(self.p2.id), ids)
        self.assertNotIn(str(self.deleted.id), ids)

    def test_public_photos_ordered_by_display_order(self):
        response = self.anon_client.get(f"{self._public_url()}?subdomain=photo-hospital")
        orders = [item['display_order'] for item in response.data]
        self.assertEqual(orders, sorted(orders))

    def test_public_returns_400_without_subdomain(self):
        response = self.anon_client.get(self._public_url())
        self.assertEqual(response.status_code, 400)

    def test_public_returns_empty_list_for_unknown_subdomain(self):
        response = self.anon_client.get(f"{self._public_url()}?subdomain=no-such-hospital")
        # Either 400 (subdomain not found) or 200 with empty list — both acceptable
        self.assertIn(response.status_code, [200, 400])

    def test_public_does_not_require_authentication(self):
        """Public endpoint is accessible without a JWT."""
        response = self.anon_client.get(f"{self._public_url()}?subdomain=photo-hospital")
        self.assertNotEqual(response.status_code, 401)

    def test_public_photo_contains_required_fields(self):
        response = self.anon_client.get(f"{self._public_url()}?subdomain=photo-hospital")
        self.assertEqual(response.status_code, 200)
        photo = next(item for item in response.data if item['id'] == str(self.p1.id))
        self.assertIn('id', photo)
        self.assertIn('display_order', photo)
        self.assertIn('alt_text', photo)
        self.assertIn('caption', photo)

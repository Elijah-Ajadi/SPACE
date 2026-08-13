import io
import json
from django.test import TestCase, Client
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import get_user_model
from .models import Entity, Bloodline

User = get_user_model()



class AuthTests(TestCase):
    """Test login page, login submission, and unauthenticated redirects/401s."""

    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.user = User.objects.create_user(username='testuser', password='password123')

    def test_unauthenticated_index_redirects_to_login(self):
        res = self.client.get(reverse('index'))
        self.assertEqual(res.status_code, 302)
        self.assertIn('/login/', res.url)

    def test_unauthenticated_api_returns_401(self):
        res = self.client.get(reverse('entity-list-create'))
        self.assertEqual(res.status_code, 401)

    def test_valid_login_redirects_to_index(self):
        res = self.client.post(reverse('login'), {'username': 'testuser', 'password': 'password123'})
        self.assertEqual(res.status_code, 302)
        self.assertEqual(res.url, '/')

    def test_invalid_login_shows_error(self):
        res = self.client.post(reverse('login'), {'username': 'testuser', 'password': 'wrongpassword'})
        self.assertEqual(res.status_code, 401)
        self.assertIn('Invalid username or password', res.content.decode())


class EntityListPaginationTests(TestCase):
    """entity_list_create pagination."""

    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.user = User.objects.create_user(username='testuser', password='password123')
        self.client.force_login(self.user)
        # Create 15 entities
        for i in range(15):
            Entity.objects.create(title=f"Entity {i}", type='NOTE')


    def test_default_returns_all_when_under_limit(self):
        res = self.client.get(reverse('entity-list-create'))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('count',    data)
        self.assertIn('results',  data)
        self.assertIn('next',     data)
        self.assertIn('previous', data)
        self.assertEqual(data['count'], 15)
        self.assertEqual(len(data['results']), 15)

    def test_limit_and_offset(self):
        res = self.client.get(reverse('entity-list-create') + '?limit=5&offset=0')
        data = res.json()
        self.assertEqual(len(data['results']), 5)
        self.assertIsNotNone(data['next'])
        self.assertIsNone(data['previous'])

    def test_offset_page_2(self):
        res = self.client.get(reverse('entity-list-create') + '?limit=5&offset=5')
        data = res.json()
        self.assertEqual(len(data['results']), 5)
        self.assertIsNotNone(data['next'])
        self.assertIsNotNone(data['previous'])

    def test_last_page_has_no_next(self):
        res = self.client.get(reverse('entity-list-create') + '?limit=5&offset=10')
        data = res.json()
        self.assertIsNone(data['next'])


class EntityCRUDTests(TestCase):
    """Basic CRUD (CSRF checks disabled for unit test convenience)."""

    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.user = User.objects.create_user(username='cruduser', password='password123')
        self.client.force_login(self.user)

    def test_create_entity(self):
        import json
        res = self.client.post(
            reverse('entity-list-create'),
            data=json.dumps({'title': 'Test', 'type': 'NOTE'}),
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data['title'], 'Test')
        self.assertIn('uuid', data)

    def test_patch_entity(self):
        import json
        entity = Entity.objects.create(title='Old', type='NOTE')
        res = self.client.patch(
            reverse('entity-detail', kwargs={'uuid': entity.uuid}),
            data=json.dumps({'title': 'New'}),
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 200)
        entity.refresh_from_db()
        self.assertEqual(entity.title, 'New')

    def test_delete_entity(self):
        entity = Entity.objects.create(title='Del', type='NOTE')
        res = self.client.delete(
            reverse('entity-detail', kwargs={'uuid': entity.uuid})
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Entity.objects.filter(pk=entity.uuid).exists())

    def test_invalid_json_returns_400(self):
        res = self.client.post(
            reverse('entity-list-create'),
            data='not-json',
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 400)


class BloodlineTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.user = User.objects.create_user(username='bluser', password='password123')
        self.client.force_login(self.user)
        self.src = Entity.objects.create(title='A', type='NOTE')
        self.tgt = Entity.objects.create(title='B', type='NOTE')

    def test_create_bloodline(self):
        import json
        res = self.client.post(
            reverse('bloodline-list-create'),
            data=json.dumps({'source': str(self.src.uuid), 'target': str(self.tgt.uuid)}),
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data['source'], str(self.src.uuid))
        self.assertEqual(data['target'], str(self.tgt.uuid))

    def test_delete_bloodline(self):
        bl = Bloodline.objects.create(source=self.src, target=self.tgt)
        res = self.client.delete(reverse('bloodline-detail', kwargs={'pk': bl.pk}))
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Bloodline.objects.filter(pk=bl.pk).exists())


class ImageUploadTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.user = User.objects.create_user(username='upuser', password='password123')
        self.client.force_login(self.user)

    def test_upload_valid_image(self):
        # Create a minimal 1x1 PNG in memory
        png_bytes = (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01'
            b'\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00'
            b'\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18'
            b'\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        f = SimpleUploadedFile('test.png', png_bytes, content_type='image/png')
        res = self.client.post(reverse('upload-image'), {'file': f})
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertIn('url', data)
        self.assertTrue(data['url'].startswith('/media/'))

    def test_upload_no_file_returns_400(self):
        res = self.client.post(reverse('upload-image'))
        self.assertEqual(res.status_code, 400)

    def test_upload_wrong_content_type_returns_415(self):
        f = SimpleUploadedFile('evil.exe', b'MZ', content_type='application/octet-stream')
        res = self.client.post(reverse('upload-image'), {'file': f})
        self.assertEqual(res.status_code, 415)

    def test_upload_too_large_returns_413(self):
        big = SimpleUploadedFile('big.png', b'A' * (11 * 1024 * 1024), content_type='image/png')
        res = self.client.post(reverse('upload-image'), {'file': big})
        self.assertEqual(res.status_code, 413)


class CSRFTests(TestCase):
    """Verify CSRF protection is active on mutating endpoints."""

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.user = User.objects.create_user(username='csrfuser', password='password123')
        self.client.force_login(self.user)


    def test_post_without_csrf_token_returns_403(self):
        import json
        res = self.client.post(
            reverse('entity-list-create'),
            data=json.dumps({'title': 'X', 'type': 'NOTE'}),
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 403)

    def test_get_does_not_require_csrf(self):
        res = self.client.get(reverse('entity-list-create'))
        self.assertEqual(res.status_code, 200)

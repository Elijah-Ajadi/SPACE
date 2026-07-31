import os
import uuid as uuid_lib
import json
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.conf import settings
from .models import Entity, Bloodline

# ── Page size for entity list ────────────────────────────────────────────────
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE     = 200


@ensure_csrf_cookie
def index(request):
    """Serve the SPA shell. ensure_csrf_cookie writes the csrftoken cookie."""
    return render(request, 'index.html')


# ── Helper: build absolute-safe media URL ────────────────────────────────────
def _media_url(path: str) -> str:
    return settings.MEDIA_URL + path


# ── Entities ─────────────────────────────────────────────────────────────────

def entity_list_create(request):
    if request.method == 'GET':
        try:
            limit  = min(int(request.GET.get('limit',  DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE)
            offset = max(int(request.GET.get('offset', 0)), 0)
        except (ValueError, TypeError):
            limit  = DEFAULT_PAGE_SIZE
            offset = 0

        qs    = Entity.objects.order_by('created_at')
        total = qs.count()
        page  = list(qs.values()[offset: offset + limit])

        base_url = request.build_absolute_uri(request.path)
        next_url = (
            f"{base_url}?limit={limit}&offset={offset + limit}"
            if offset + limit < total else None
        )
        prev_url = (
            f"{base_url}?limit={limit}&offset={max(offset - limit, 0)}"
            if offset > 0 else None
        )

        return JsonResponse({
            'count':    total,
            'next':     next_url,
            'previous': prev_url,
            'results':  page,
        })

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        entity = Entity.objects.create(
            title=data.get('title', 'Untitled'),
            content=data.get('content', ''),
            type=data.get('type', 'NOTE'),
            position_x=data.get('position_x', 0.0),
            position_y=data.get('position_y', 0.0),
            width=data.get('width', 0.0),
            height=data.get('height', 0.0),
            color=data.get('color', '#18181b'),
        )
        return JsonResponse({
            'uuid':       str(entity.uuid),
            'title':      entity.title,
            'type':       entity.type,
            'position_x': entity.position_x,
            'position_y': entity.position_y,
            'width':      entity.width,
            'height':     entity.height,
        }, status=201)

    return JsonResponse({'error': 'Method not allowed'}, status=405)


def entity_detail(request, uuid):
    entity = get_object_or_404(Entity, uuid=uuid)

    if request.method == 'GET':
        return JsonResponse({
            'uuid':       str(entity.uuid),
            'title':      entity.title,
            'content':    entity.content,
            'type':       entity.type,
            'position_x': entity.position_x,
            'position_y': entity.position_y,
            'width':      entity.width,
            'height':     entity.height,
            'color':      entity.color,
        })

    if request.method == 'PATCH':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        if 'title'      in data: entity.title      = data['title']
        if 'content'    in data: entity.content    = data['content']
        if 'type'       in data: entity.type       = data['type']
        if 'position_x' in data: entity.position_x = data['position_x']
        if 'position_y' in data: entity.position_y = data['position_y']
        if 'width'      in data: entity.width      = data['width']
        if 'height'     in data: entity.height     = data['height']
        if 'color'      in data: entity.color      = data['color']
        entity.save()
        return JsonResponse({'status': 'updated'})

    if request.method == 'DELETE':
        entity.delete()
        return JsonResponse({'status': 'deleted'})

    return JsonResponse({'error': 'Method not allowed'}, status=405)


# ── Bloodlines ────────────────────────────────────────────────────────────────

def bloodline_list_create(request):
    if request.method == 'GET':
        bloodlines = [
            {
                'id':                b.id,
                'source':            str(b.source.uuid),
                'target':            str(b.target.uuid),
                'relationship_type': b.relationship_type,
            }
            for b in Bloodline.objects.select_related('source', 'target').all()
        ]
        return JsonResponse(bloodlines, safe=False)

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        source = get_object_or_404(Entity, uuid=data.get('source'))
        target = get_object_or_404(Entity, uuid=data.get('target'))
        bloodline = Bloodline.objects.create(
            source=source,
            target=target,
            relationship_type=data.get('relationship_type', ''),
        )
        return JsonResponse({
            'id':     bloodline.id,
            'source': str(source.uuid),
            'target': str(target.uuid),
        }, status=201)

    return JsonResponse({'error': 'Method not allowed'}, status=405)


def bloodline_detail(request, pk):
    bloodline = get_object_or_404(Bloodline, pk=pk)
    if request.method == 'DELETE':
        bloodline.delete()
        return JsonResponse({'status': 'deleted'}, status=200)
    return JsonResponse({'error': 'Method not allowed'}, status=405)


# ── Image Upload ──────────────────────────────────────────────────────────────

@require_http_methods(['POST'])
def upload_image(request):
    """
    Accept a multipart POST with a 'file' field.
    Saves to MEDIA_ROOT/uploads/ and returns { url: '/media/uploads/<name>' }.
    Max size: 10 MB.
    """
    uploaded = request.FILES.get('file')
    if not uploaded:
        return JsonResponse({'error': 'No file provided'}, status=400)

    # Basic size guard (10 MB)
    if uploaded.size > 10 * 1024 * 1024:
        return JsonResponse({'error': 'File too large (max 10 MB)'}, status=413)

    # Validate content type
    allowed_types = {'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'}
    if uploaded.content_type not in allowed_types:
        return JsonResponse({'error': 'Unsupported file type'}, status=415)

    # Build a unique filename to prevent collisions
    ext      = os.path.splitext(uploaded.name)[1].lower() or '.bin'
    filename = f"uploads/{uuid_lib.uuid4().hex}{ext}"

    saved_path = default_storage.save(filename, ContentFile(uploaded.read()))
    url        = settings.MEDIA_URL + saved_path

    return JsonResponse({'url': url}, status=201)

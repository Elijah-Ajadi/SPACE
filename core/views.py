import json
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from .models import Entity, Bloodline

def index(request):
    return render(request, 'index.html')

@csrf_exempt
def entity_list_create(request):
    if request.method == 'GET':
        entities = list(Entity.objects.values())
        return JsonResponse(entities, safe=False)
    
    if request.method == 'POST':
        data = json.loads(request.body)
        entity = Entity.objects.create(
            title=data.get('title', 'Untitled'),
            content=data.get('content', ''),
            type=data.get('type', 'NOTE'),
            position_x=data.get('position_x', 0.0),
            position_y=data.get('position_y', 0.0),
            color=data.get('color', '#18181b')
        )
        return JsonResponse({
            'uuid': entity.uuid,
            'title': entity.title,
            'type': entity.type,
            'position_x': entity.position_x,
            'position_y': entity.position_y
        }, status=201)

@csrf_exempt
def entity_detail(request, uuid):
    entity = get_object_or_404(Entity, uuid=uuid)
    
    if request.method == 'GET':
        return JsonResponse({
            'uuid': entity.uuid,
            'title': entity.title,
            'content': entity.content,
            'type': entity.type,
            'position_x': entity.position_x,
            'position_y': entity.position_y,
            'color': entity.color
        })
    
    if request.method == 'PATCH':
        data = json.loads(request.body)
        if 'title' in data: entity.title = data['title']
        if 'content' in data: entity.content = data['content']
        if 'type' in data: entity.type = data['type']
        if 'position_x' in data: entity.position_x = data['position_x']
        if 'position_y' in data: entity.position_y = data['position_y']
        if 'color' in data: entity.color = data['color']
        entity.save()
        return JsonResponse({'status': 'updated'})
    
    if request.method == 'DELETE':
        entity.delete()
        return JsonResponse({'status': 'deleted'})

@csrf_exempt
def bloodline_list_create(request):
    if request.method == 'GET':
        bloodlines = [
            {
                'id': b.id,
                'source': b.source.uuid,
                'target': b.target.uuid,
                'relationship_type': b.relationship_type
            } for b in Bloodline.objects.all()
        ]
        return JsonResponse(bloodlines, safe=False)
    
    if request.method == 'POST':
        data = json.loads(request.body)
        source = get_object_or_404(Entity, uuid=data['source'])
        target = get_object_or_404(Entity, uuid=data['target'])
        bloodline = Bloodline.objects.create(
            source=source,
            target=target,
            relationship_type=data.get('relationship_type', '')
        )
        return JsonResponse({
            'id': bloodline.id,
            'source': source.uuid,
            'target': target.uuid
        }, status=201)

@csrf_exempt
def bloodline_detail(request, pk):
    bloodline = get_object_or_404(Bloodline, pk=pk)
    if request.method == 'DELETE':
        bloodline.delete()
        return JsonResponse({'status': 'deleted'}, status=204)

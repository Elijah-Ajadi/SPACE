from django.urls import path
from . import views

urlpatterns = [
    path('',                        views.index,                name='index'),
    path('entities/',               views.entity_list_create,   name='entity-list-create'),
    path('entities/<uuid:uuid>/',   views.entity_detail,        name='entity-detail'),
    path('bloodlines/',             views.bloodline_list_create, name='bloodline-list-create'),
    path('bloodlines/<int:pk>/',    views.bloodline_detail,     name='bloodline-detail'),
    path('upload/',                 views.upload_image,         name='upload-image'),
]

from django.urls import path
from . import views

urlpatterns = [
    path('', views.start, name='start'),
    path('game/', views.game, name='game'),
]
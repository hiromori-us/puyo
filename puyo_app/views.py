from django.shortcuts import render
from django.http import HttpResponse

# Create your views here.

def start(request):
    """スタート画面を表示"""
    return render(request, 'puyo_app/start.html')

def game(request):
    """ゲーム画面を表示"""
    # スタート画面からの設定を取得
    speed = request.POST.get('speed', 'medium')  # low, medium, high
    bgm_enabled = request.POST.get('bgm', 'on') == 'on'
    sound_enabled = request.POST.get('sound', 'on') == 'on'
    
    context = {
        'speed': speed,
        'bgm_enabled': bgm_enabled,
        'sound_enabled': sound_enabled,
    }
    
    return render(request, 'puyo_app/game.html', context)

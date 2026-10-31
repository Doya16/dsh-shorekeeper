"""Render the real pet widget as the project logo, using isolated demo data."""
import copy
import json
import os
from pathlib import Path
import sys
from unittest.mock import patch

os.environ['QT_QPA_PLATFORM'] = 'offscreen'
os.environ['QT_SCALE_FACTOR'] = '1'
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'desktop'))

from PySide6.QtCore import QPoint, QRect, Qt
from PySide6.QtGui import QImage, QPainter, QRegion
from PySide6.QtWidgets import QApplication, QWidget
from shorekeeper_pet import pet as module

DEMO_LABEL = '算力配额：1145.14'


class LogoPet(module.Pet):
    def screen_area(self):
        return QRect(0, 0, 4096, 4096)

    def quota_label(self, compact=False):
        return DEMO_LABEL

    def save_settings(self):
        # A documentation render must never save a profile or a demo balance.
        return True


def main():
    app = QApplication([])
    app.setQuitOnLastWindowClosed(False)
    settings = json.loads((ROOT / 'desktop/defaults/settings.json').read_text('utf-8'))
    settings['scale'] = 2.0
    settings['appearance'].update(audio_enabled=False, audio_muted=True,
        interaction_locked=False, quota_scale=1.0, quota_font_size=20,
        pet_size=400, check_updates_on_start=False)
    for binding in settings['bindings'].values():
        binding['bubble_mode'] = 'off'
    with patch.object(module, 'load_settings', return_value=copy.deepcopy(settings)):
        pet = LogoPet(offline=True)
    try:
        pet.timer.stop()
        pet.click_timer.stop()
        pet.hover_timer.stop()
        pet.quota_data = {'source': 'logo-demo', 'wallets': [{'currency': 'CNY', 'balance': '1145.14'}]}
        pet.animation.frame = lambda *args, **kwargs: pet.animation.frames[0]
        pet.transition_old = None
        pet.update_layout()
        pet.lock_button.hide()
        pet.bubble_window.hide()
        image = QImage(1024, 1024, QImage.Format.Format_ARGB32_Premultiplied)
        image.fill(Qt.GlobalColor.transparent)
        assert pet.width() <= 1024 and pet.height() <= 1024
        painter = QPainter(image)
        try:
            pet.render(painter, QPoint((1024 - pet.width()) // 2, (1024 - pet.height()) // 2),
                QRegion(), QWidget.RenderFlag.DrawChildren)
        finally:
            painter.end()
        destination = ROOT / 'icon.png'
        assert image.save(str(destination))
        print(json.dumps({'file': str(destination), 'size': [1024, 1024],
            'label': DEMO_LABEL, 'asset': pet.animation_id, 'demo_only': True}, ensure_ascii=False))
    finally:
        pet.voice.stop()
        pet.rate_client.close()
        pet.updates.close()
        pet.hide()
        pet.deleteLater()
        app.processEvents()


if __name__ == '__main__':
    main()

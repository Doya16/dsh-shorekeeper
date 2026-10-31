"""A small, local-only command channel for the Harness companion plugin."""
import json,time
from PySide6.QtCore import QTimer

def attach_control(pet,app,root):
    path=root/'harness-command.json'
    def poll():
        try:
            if path.stat().st_size>2048: return
            value=json.loads(path.read_text('utf8')); path.unlink()
            if not isinstance(value,dict) or abs(time.time()-float(value.get('time',0)))>30: return
            command=value.get('command')
            if command=='close': pet.shutdown()
            elif command=='settings': pet.show(); pet.open_preferences()
            elif command=='show': pet.show()
            elif command=='hide': pet.hide()
        except (OSError,ValueError,TypeError): pass
    timer=QTimer(pet);timer.timeout.connect(poll);timer.start(250)
    app.aboutToQuit.connect(timer.stop)
    def mark_closed():
        try: (root/'runtime.json').write_text(json.dumps({'closed':True,'updated_at':0}),encoding='utf8')
        except OSError: pass
    app.aboutToQuit.connect(mark_closed)
    return timer

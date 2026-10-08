"""Builds index.html from src/ by inlining the PHOSPHOR brand files, the icon sprite, recipe data and app code.
Usage: python3 build.py [path/to/brand/folder]   (default: the project's shared brand folder)"""
import sys, os
B = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/brand/'
here = os.path.dirname(os.path.abspath(__file__))
src = lambda f: open(os.path.join(here, 'src', f)).read()
h = src('app.html')
for k, v in {'/*@@PHOSPHOR_CSS@@*/': open(os.path.join(B, 'phosphor.css')).read(),
             '/*@@PHOSPHOR_JS@@*/': open(os.path.join(B, 'phosphor.js')).read(),
             '<!--@@ICONS@@-->': src('icons.svg'),
             '/*@@DATA_JS@@*/': src('data.js'),
             '/*@@APP_JS@@*/': src('app.js')}.items():
    assert k in h, k
    h = h.replace(k, v)
open(os.path.join(here, 'index.html'), 'w').write(h)
print(len(h), 'bytes')

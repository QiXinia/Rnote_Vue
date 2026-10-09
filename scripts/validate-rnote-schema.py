#!/usr/bin/env python3
"""Strictly validate a .rnote (gzip JSON) against the *Rust serde schema* of
desktop Rnote 0.15. Any error reported here is an error that would make the Rust
deserializer (and thus desktop Rnote) reject the file.

Usage: validate-rnote-schema.py <file.rnote|file.json> [more...]
"""
import sys, json, gzip

PC = {'const','linear','sqrt','cbrt','pow2','pow3'}
LS = {'solid','dotted','dashed_narrow','dashed_equidistant','dashed_wide'}
LC = {'straight','rounded'}
FS = {'solid','hachure','zig_zag','zig_zag_line','crosshatch','dots','dashed'}
DIST = {'Uniform','Normal','Exponential','ReverseExponential'}
FSTYLE = {'regular','italic'}
ALIGN = {'start','center','end','fill'}
PATTERN = {'none','lines','grid','dots','isometric_grid','isometric_dots'}
LAYOUT = {'fixed_size','continuous_vertical','semi_infinite','infinite'}
ORIENT = {'portrait','landscape'}
MEMFMT = {'R8g8b8a8Premultiplied','R8g8b8B8a8Premultiplied'}

errors = []
path = []

def ctx(p):
    return '.'.join(str(x) for x in path+[p])

def is_num(x):
    return isinstance(x,(int,float)) and not isinstance(x,bool)

def is_uint(x):
    return isinstance(x,int) and x>=0 and not isinstance(x,bool)

def need(cond, msg):
    if not cond:
        errors.append('.'.join(str(x) for x in path)+': '+msg)

def check_color(x, p='color'):
    path.append(p)
    if not isinstance(x,dict):
        errors.append(ctx('?')+': expected color object {r,g,b,a}')
    else:
        for k in ('r','g','b','a'):
            if k not in x:
                errors.append(ctx(k)+': missing')
            elif not is_num(x[k]):
                errors.append(ctx(k)+': expected number, got '+repr(x[k]))
    path.pop()

def opt_color(x,p):
    if x is None: return
    check_color(x,p)

def check_affine(x,p='affine'):
    path.append(p)
    if not isinstance(x,list) or len(x)!=6:
        errors.append(ctx('?')+': expected affine array of 6 numbers')
    else:
        for i,v in enumerate(x):
            if not is_num(v): errors.append(ctx(i)+': expected number, got '+repr(v))
    path.pop()

def check_vec2(x,p):
    path.append(p)
    if not isinstance(x,list) or len(x)!=2 or not all(is_num(v) for v in x):
        errors.append(ctx('?')+': expected [x,y] numbers')
    path.pop()

def check_rect(x,p='rectangle'):
    path.append(p)
    if not isinstance(x,dict):
        errors.append(ctx('?')+': expected rectangle object')
    else:
        ce = x.get('cuboid',{}).get('half_extents')
        check_vec2(ce,'cuboid.half_extents')
        check_affine(x.get('affine'),'affine')
    path.pop()

def check_element(x,p):
    path.append(p)
    if not isinstance(x,dict):
        errors.append(ctx('?')+': expected element')
    else:
        check_vec2(x.get('pos'),'pos')
        if not is_num(x.get('pressure')): errors.append(ctx('pressure')+': expected number')
    path.pop()

def check_segment(x,p):
    path.append(p)
    if not isinstance(x,dict) or len(x)!=1:
        errors.append(ctx('?')+': expected single-tag segment')
    else:
        tag=list(x.keys())[0]; body=x[tag]
        if tag=='lineto':
            check_element(body.get('end'),'lineto.end')
        elif tag=='quadbezto':
            check_element(body.get('cp'),'quadbezto.cp'); check_element(body.get('end'),'quadbezto.end')
        elif tag=='cubbezto':
            check_element(body.get('cp1'),'cubbezto.cp1'); check_element(body.get('cp2'),'cubbezto.cp2'); check_element(body.get('end'),'cubbezto.end')
        else:
            errors.append(ctx(tag)+': unknown segment variant')
    path.pop()

def check_penpath(x,p='path'):
    path.append(p)
    check_element(x.get('start'),'start')
    segs=x.get('segments')
    if not isinstance(segs,list): errors.append(ctx('segments')+': expected array')
    else:
        for i,s in enumerate(segs): check_segment(s,i)
    path.pop()

def check_smooth(x,p='smooth'):
    path.append(p)
    if not is_num(x.get('stroke_width')): errors.append(ctx('stroke_width')+': expected number')
    opt_color(x.get('stroke_color'),'stroke_color')
    opt_color(x.get('fill_color'),'fill_color')
    if x.get('pressure_curve') not in PC: errors.append(ctx('pressure_curve')+': invalid '+repr(x.get('pressure_curve')))
    if x.get('line_style') not in LS: errors.append(ctx('line_style')+': invalid '+repr(x.get('line_style')))
    if x.get('line_cap') not in LC: errors.append(ctx('line_cap')+': invalid '+repr(x.get('line_cap')))
    path.pop()

def check_rough(x,p='rough'):
    path.append(p)
    opt_color(x.get('stroke_color'),'stroke_color')
    if not is_num(x.get('stroke_width')): errors.append(ctx('stroke_width')+': expected number')
    opt_color(x.get('fill_color'),'fill_color')
    if x.get('fill_style') not in FS: errors.append(ctx('fill_style')+': invalid '+repr(x.get('fill_style')))
    if not is_num(x.get('hachure_angle')): errors.append(ctx('hachure_angle')+': expected number')
    seed=x.get('seed')
    if seed is not None and not is_uint(seed): errors.append(ctx('seed')+': expected u64 or null')
    path.pop()

def check_textured(x,p='textured'):
    path.append(p)
    seed=x.get('seed')
    if seed is not None and not is_uint(seed): errors.append(ctx('seed')+': expected u64 or null')
    if not is_num(x.get('stroke_width')): errors.append(ctx('stroke_width')+': expected number')
    opt_color(x.get('stroke_color'),'stroke_color')
    if not is_num(x.get('density')): errors.append(ctx('density')+': expected number')
    if x.get('distribution') not in DIST: errors.append(ctx('distribution')+': invalid '+repr(x.get('distribution')))
    if x.get('pressure_curve') not in PC: errors.append(ctx('pressure_curve')+': invalid '+repr(x.get('pressure_curve')))
    path.pop()

def check_style(x,p='style'):
    path.append(p)
    if not isinstance(x,dict) or len(x)!=1:
        errors.append(ctx('?')+': expected single-tag style')
    else:
        tag=list(x.keys())[0]
        if tag=='smooth': check_smooth(x[tag])
        elif tag=='rough': check_rough(x[tag])
        elif tag=='textured': check_textured(x[tag])
        else: errors.append(ctx(tag)+': unknown style variant')
    path.pop()

def check_shape(x,p='shape'):
    path.append(p)
    if not isinstance(x,dict) or len(x)!=1:
        errors.append(ctx('?')+': expected single-tag shape')
    else:
        tag=list(x.keys())[0]; b=x[tag]
        if tag=='line':
            check_vec2(b.get('start'),'line.start'); check_vec2(b.get('end'),'line.end')
        elif tag=='arrow':
            check_vec2(b.get('start'),'arrow.start'); check_vec2(b.get('tip'),'arrow.tip')
        elif tag=='rect':
            check_rect(b,'rect')
        elif tag=='ellipse':
            check_vec2(b.get('radii'),'ellipse.radii'); check_affine(b.get('affine'),'ellipse.affine')
        elif tag=='quadbez':
            check_vec2(b.get('start'),'quadbez.start'); check_vec2(b.get('cp'),'quadbez.cp'); check_vec2(b.get('end'),'quadbez.end')
        elif tag=='cubbez':
            for k in ('start','cp1','cp2','end'): check_vec2(b.get(k),'cubbez.'+k)
        elif tag in ('polyline','polygon'):
            check_vec2(b.get('start'),tag+'.start')
            pp=b.get('path')
            if not isinstance(pp,list): errors.append(ctx(tag+'.path')+': expected array')
            else:
                for i,ptv in enumerate(pp): check_vec2(ptv,tag+'.path['+str(i)+']')
        else:
            errors.append(ctx(tag)+': unknown shape variant')
    path.pop()

def check_textstyle(x,p='text_style'):
    path.append(p)
    if not isinstance(x.get('font_family'),str): errors.append(ctx('font_family')+': expected string')
    if not is_num(x.get('font_size')): errors.append(ctx('font_size')+': expected number')
    if not is_uint(x.get('font_weight')): errors.append(ctx('font_weight')+': expected u16')
    if x.get('font_style') not in FSTYLE: errors.append(ctx('font_style')+': invalid')
    check_color(x.get('color'),'color')
    mw=x.get('max_width')
    if mw is not None and not is_num(mw): errors.append(ctx('max_width')+': expected number or null')
    if x.get('alignment') not in ALIGN: errors.append(ctx('alignment')+': invalid')
    rta=x.get('ranged_text_attributes')
    if not isinstance(rta,list): errors.append(ctx('ranged_text_attributes')+': expected array')
    path.pop()

def check_stroke(x,p):
    path.append(p)
    if not isinstance(x,dict) or len(x)!=1:
        errors.append(ctx('?')+': expected single-tag stroke')
    else:
        tag=list(x.keys())[0]; b=x[tag]
        if tag=='brushstroke':
            check_penpath(b.get('path')); check_style(b.get('style'))
        elif tag=='shapestroke':
            check_shape(b.get('shape')); check_style(b.get('style'))
        elif tag=='textstroke':
            if not isinstance(b.get('text'),str): errors.append(ctx('text')+': expected string')
            check_affine(b.get('affine')); check_textstyle(b.get('text_style'))
        elif tag=='vectorimage':
            if not isinstance(b.get('svg_data'),str): errors.append(ctx('svg_data')+': expected string')
            check_vec2(b.get('intrinsic_size'),'intrinsic_size'); check_rect(b.get('rectangle'))
        elif tag=='bitmapimage':
            img=b.get('image',{})
            if not isinstance(img.get('data'),str): errors.append(ctx('image.data')+': expected base64 string')
            check_rect(img.get('rectangle'),'image.rectangle')
            if not is_uint(img.get('pixel_width')): errors.append(ctx('image.pixel_width')+': expected uint')
            if not is_uint(img.get('pixel_height')): errors.append(ctx('image.pixel_height')+': expected uint')
            if img.get('memory_format') not in MEMFMT: errors.append(ctx('image.memory_format')+': invalid '+repr(img.get('memory_format')))
            check_rect(b.get('rectangle'))
        else:
            errors.append(ctx(tag)+': unknown stroke variant')
    path.pop()

def check_layer(x,p):
    path.append(p)
    if x in ('document','image','highlighter'):
        pass
    elif isinstance(x,dict) and list(x.keys())==['user_layer'] and is_uint(x['user_layer']):
        pass
    else:
        errors.append(ctx('?')+': invalid chrono layer '+repr(x))
    path.pop()

def check_entry(arr, kind):
    # element: {value: Option<...>, version: uint}
    for i,e in enumerate(arr):
        path.append(kind+'['+str(i)+']')
        if not isinstance(e,dict):
            errors.append(ctx('?')+': expected entry {value,version}')
        else:
            if 'version' not in e or not is_uint(e.get('version')):
                errors.append(ctx('version')+': expected uint')
            v=e.get('value')
            if kind=='stroke_components':
                if v is not None: check_stroke(v,'value')
            else:
                if v is not None:
                    if not is_num(v.get('t')): errors.append(ctx('value.t')+': expected uint')
                    check_layer(v.get('layer'),'value.layer')
        path.pop()

def validate(doc):
    es = doc.get('data',{}).get('engine_snapshot') if isinstance(doc,dict) else None
    if es is None:
        # maybe raw snapshot
        es = doc.get('engine_snapshot') if isinstance(doc,dict) else None
    if es is None:
        errors.append('could not locate engine_snapshot')
        return
    # document
    d=es.get('document',{})
    cfg=d.get('config',{}); fmt=cfg.get('format',{}); bg=cfg.get('background',{})
    if not is_num(fmt.get('width')): errors.append('document.config.format.width: expected number')
    if not is_num(fmt.get('height')): errors.append('document.config.format.height: expected number')
    if not is_num(fmt.get('dpi')): errors.append('document.config.format.dpi: expected number')
    if fmt.get('orientation') not in ORIENT: errors.append('document.config.format.orientation: invalid')
    check_color(fmt.get('border_color'),'document.config.format.border_color')
    if not isinstance(fmt.get('show_borders'),bool): errors.append('format.show_borders: expected bool')
    if not isinstance(fmt.get('show_origin_indicator'),bool): errors.append('format.show_origin_indicator: expected bool')
    check_color(bg.get('color'),'background.color')
    if bg.get('pattern') not in PATTERN: errors.append('background.pattern: invalid '+repr(bg.get('pattern')))
    check_vec2(bg.get('pattern_size'),'background.pattern_size')
    check_color(bg.get('pattern_color'),'background.pattern_color')
    if cfg.get('layout') not in LAYOUT: errors.append('config.layout: invalid '+repr(cfg.get('layout')))
    for k in ('x','y','width','height'):
        if not is_num(d.get(k)): errors.append('document.'+k+': expected number')
    # camera
    cam=es.get('camera',{})
    check_vec2(cam.get('offset'),'camera.offset')
    check_vec2(cam.get('size'),'camera.size')
    if not is_num(cam.get('zoom')): errors.append('camera.zoom: expected number')
    # arrays
    check_entry(es.get('stroke_components',[]),'stroke_components')
    check_entry(es.get('chrono_components',[]),'chrono_components')
    if not is_uint(es.get('chrono_counter')): errors.append('chrono_counter: expected uint')
    # length alignment
    if len(es.get('stroke_components',[])) != len(es.get('chrono_components',[])):
        errors.append('stroke_components and chrono_components must have equal length')

def load(path):
    b=open(path,'rb').read()
    if b[:2]==b'\x1f\x8b':
        b=gzip.decompress(b)
    return json.loads(b.decode())

if __name__=='__main__':
    rc=0
    for f in sys.argv[1:]:
        errors.clear(); path.clear()
        try:
            validate(load(f))
        except Exception as e:
            errors.append('FATAL '+repr(e))
        if errors:
            rc=1
            print('FAIL',f)
            for e in errors: print('   ',e)
        else:
            print('PASS',f)
    sys.exit(rc)

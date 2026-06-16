import os
import re
import xml.etree.ElementTree as ET

# Register namespaces
namespaces = {
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'
}
for prefix, uri in namespaces.items():
    ET.register_namespace(prefix, uri)

SLIDES_DIR = "/home/st4rk/Public/ppt/unpacked/ppt/slides"

def clear_node_text(node):
    ps = node.findall('.//a:p', namespaces)
    if not ps:
        p = ET.SubElement(node, '{http://schemas.openxmlformats.org/drawingml/2006/main}p')
        return p
    
    first_p = ps[0]
    for child in list(first_p):
        if not child.tag.endswith('pPr'):
            first_p.remove(child)
            
    for p in ps[1:]:
        node.remove(p)
    return first_p

def add_run(p, text, bold=False, sz=1800, color=None):
    r = ET.SubElement(p, '{http://schemas.openxmlformats.org/drawingml/2006/main}r')
    rPr = ET.SubElement(r, '{http://schemas.openxmlformats.org/drawingml/2006/main}rPr')
    rPr.set('lang', 'en-US')
    if sz: rPr.set('sz', str(sz))
    if bold: rPr.set('b', '1')
    
    if color:
        solidFill = ET.SubElement(rPr, '{http://schemas.openxmlformats.org/drawingml/2006/main}solidFill')
        srgbClr = ET.SubElement(solidFill, '{http://schemas.openxmlformats.org/drawingml/2006/main}srgbClr')
        srgbClr.set('val', color)
    else:
        solidFill = ET.SubElement(rPr, '{http://schemas.openxmlformats.org/drawingml/2006/main}solidFill')
        schemeClr = ET.SubElement(solidFill, '{http://schemas.openxmlformats.org/drawingml/2006/main}schemeClr')
        schemeClr.set('val', 'dk1') # Use dk1 for white text
        
    latin = ET.SubElement(rPr, '{http://schemas.openxmlformats.org/drawingml/2006/main}latin')
    latin.set('typeface', 'Arial')
    
    t = ET.SubElement(r, '{http://schemas.openxmlformats.org/drawingml/2006/main}t')
    t.text = text

def add_bullet_p(txBody, text, level=0, bold=False, sz=1800, color=None):
    p = ET.SubElement(txBody, '{http://schemas.openxmlformats.org/drawingml/2006/main}p')
    pPr = ET.SubElement(p, '{http://schemas.openxmlformats.org/drawingml/2006/main}pPr')
    pPr.set('lvl', str(level))
    marL = level * 457200 + 342900
    pPr.set('marL', str(marL))
    pPr.set('indent', '-342900')
    
    buChar = ET.SubElement(pPr, '{http://schemas.openxmlformats.org/drawingml/2006/main}buChar')
    buChar.set('char', '▸')
    
    add_run(p, text, bold=bold, sz=sz, color=color)

def parse_content(content):
    slides = []
    sections = re.split(r'SLIDE \d+', content)
    for section in sections[1:]:
        slide = {}
        title_match = re.search(r'Slide Title: (.*)', section)
        slide['title'] = title_match.group(1).strip() if title_match else ""
        
        main_content_match = re.search(r'Main Content: (.*)', section)
        slide['main_content'] = main_content_match.group(1).strip() if main_content_match else ""
        
        bullets_match = re.search(r'Bullet Points:\s*\n((?:   - .*\n?)+)', section)
        if bullets_match:
            slide['bullets'] = [b.strip()[2:] for b in bullets_match.group(1).strip().split('\n') if b.strip()]
        else:
            slide['bullets'] = []
            
        metrics_match = re.search(r'Metrics:\s*\n((?:   - .*\n?)+)', section)
        if metrics_match:
            slide['metrics'] = [m.strip()[2:] for m in metrics_match.group(1).strip().split('\n') if m.strip()]
        else:
            slide['metrics'] = []
        
        table_match = re.search(r'\|.*\|\n((?:\|.*\|\n?)+)', section)
        if table_match:
            lines = table_match.group(0).strip().split('\n')
            slide['table'] = [re.split(r'\s*\|\s*', l.strip('|')) for l in lines]
            # Remove separator line if exists
            if len(slide['table']) > 1 and all(c.strip('- ') == '' for c in slide['table'][1]):
                slide['table'].pop(1)
        else:
            slide['table'] = None
            
        slides.append(slide)
    return slides

def update_slide(n, data, diagram=None):
    path = os.path.join(SLIDES_DIR, f"slide{n}.xml")
    tree = ET.parse(path)
    root = tree.getroot()
    
    # Find placeholders
    title_node = None
    body_node = None
    table_node = None
    
    for sp in root.findall('.//p:sp', namespaces):
        ph = sp.find('.//p:ph', namespaces)
        if ph is not None:
            ph_type = ph.get('type')
            if ph_type in ['title', 'ctrTitle']:
                title_node = sp
            elif ph_type in ['body', 'obj', 'subTitle']:
                body_node = sp

    table_node = root.find('.//a:tbl', namespaces)
                
    if title_node is not None:
        txBody = title_node.find('.//p:txBody', namespaces)
        if txBody is not None:
            p = clear_node_text(txBody)
            if p is not None:
                add_run(p, data['title'], bold=True, sz=3200, color='00D8FF')

    if body_node is not None and not data['table']:
        txBody = body_node.find('.//p:txBody', namespaces)
        if txBody is not None:
            for p in list(txBody.findall('{http://schemas.openxmlformats.org/drawingml/2006/main}p')):
                txBody.remove(p)
            
            if data['main_content']:
                p = ET.SubElement(txBody, '{http://schemas.openxmlformats.org/drawingml/2006/main}p')
                add_run(p, data['main_content'], bold=True, sz=1800, color='FFFFFF')
            
            for bullet in data['bullets']:
                add_bullet_p(txBody, bullet, level=0, sz=1600)
            
            for metric in data.get('metrics', []):
                add_bullet_p(txBody, metric, level=0, bold=True, sz=1600, color='008CFF')

            if diagram:
                for line in diagram.split('\n'):
                    p = ET.SubElement(txBody, '{http://schemas.openxmlformats.org/drawingml/2006/main}p')
                    add_run(p, line, sz=1000, color='B8C0CC')

    if table_node is not None and data['table']:
        trs = table_node.findall('.//a:tr', namespaces)
        for i, row_data in enumerate(data['table']):
            if i < len(trs):
                tr = trs[i]
                tcs = tr.findall('.//a:tc', namespaces)
                for j, cell_text in enumerate(row_data):
                    if j < len(tcs):
                        tc = tcs[j]
                        txBody = tc.find('.//a:txBody', namespaces)
                        if txBody is not None:
                            p = clear_node_text(txBody)
                            add_run(p, cell_text.strip(), sz=1400 if i > 0 else 1600, bold=(i==0))

    tree.write(path, encoding='utf-8', xml_declaration=True)

# Load diagrams
with open("diagram.txt", "r") as f:
    diag_text = f.read()
diagrams_list = diag_text.split('---')
diag_map = {
    8: diagrams_list[0].strip(),
    9: diagrams_list[1].strip(),
    10: diagrams_list[2].strip(),
    13: diagrams_list[3].strip(),
    12: diagrams_list[4].strip(),
    26: diagrams_list[4].strip(),
}

with open("content.txt", "r") as f:
    content = f.read()

slides_data = parse_content(content)

for i, data in enumerate(slides_data, 1):
    print(f"Updating slide {i}: {data['title']}")
    diag = diag_map.get(i)
    update_slide(i, data, diag)

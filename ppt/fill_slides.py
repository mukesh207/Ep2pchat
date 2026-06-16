import os
import re
from xml.dom import minidom

def set_white_color(doc):
    for tag in ['a:schemeClr', 'a:srgbClr']:
        for clr in doc.getElementsByTagName(tag):
            if tag == 'a:schemeClr':
                srgb = doc.createElement('a:srgbClr')
                srgb.setAttribute('val', 'FFFFFF')
                clr.parentNode.replaceChild(srgb, clr)
            else:
                clr.setAttribute('val', 'FFFFFF')

def create_text_run(doc, text, sz=None, b=False):
    r = doc.createElement('a:r')
    rPr = doc.createElement('a:rPr')
    rPr.setAttribute('lang', 'en-US')
    if sz: rPr.setAttribute('sz', str(sz))
    if b: rPr.setAttribute('b', '1')
    
    latin = doc.createElement('a:latin')
    latin.setAttribute('typeface', 'Arial')
    rPr.appendChild(latin)
    
    solidFill = doc.createElement('a:solidFill')
    srgbClr = doc.createElement('a:srgbClr')
    srgbClr.setAttribute('val', 'FFFFFF')
    solidFill.appendChild(srgbClr)
    rPr.appendChild(solidFill)
    
    r.appendChild(rPr)
    t = doc.createElement('a:t')
    t.appendChild(doc.createTextNode(text))
    r.appendChild(t)
    return r

def parse_content(content):
    slides_data = {}
    parts = re.split(r'SLIDE (\d+)', content)
    for i in range(1, len(parts), 2):
        slide_num = int(parts[i])
        slide_content = parts[i+1]
        data = {'title': '', 'content': '', 'bullets': [], 'table': [], 'metrics': []}
        lines = slide_content.split('\n')
        current_section = None
        for line in lines:
            line = line.strip()
            if not line: continue
            if 'Slide Title:' in line: data['title'] = line.split('Slide Title:', 1)[1].strip()
            elif 'Main Content:' in line: data['content'] = line.split('Main Content:', 1)[1].strip()
            elif 'Bullet Points:' in line: current_section = 'bullets'
            elif 'Tables:' in line: current_section = 'table'
            elif 'Metrics:' in line: current_section = 'metrics'
            elif 'Technical Notes:' in line or 'Diagram Explanation:' in line: current_section = None
            elif line.startswith('- ') or line.startswith('* '):
                if current_section == 'bullets': data['bullets'].append(line[2:].strip())
                elif current_section == 'metrics': data['metrics'].append(line[2:].strip())
            elif line.startswith('|') and current_section == 'table':
                if '---' not in line: data['table'].append([c.strip() for c in line.split('|')[1:-1]])
        slides_data[slide_num] = data
    return slides_data

def fill_slide(slide_num, data, unpacked_path):
    xml_path = os.path.join(unpacked_path, 'ppt', 'slides', f'slide{slide_num}.xml')
    if not os.path.exists(xml_path): return
    doc = minidom.parse(xml_path)
    set_white_color(doc)
    
    if slide_num == 1:
        for r in doc.getElementsByTagName('a:r'):
            t_nodes = r.getElementsByTagName('a:t')
            if not t_nodes: continue
            t = t_nodes[0]
            curr_text = "".join([c.data for c in t.childNodes if c.nodeType == t.TEXT_NODE])
            if "TITLE" in curr_text: t.childNodes[0].data = "TRUSTLINE"
            if "STUDENT NAMES" in curr_text: t.childNodes[0].data = "Student 1, Student 2, Student 3"
            if "REG NOs" in curr_text: t.childNodes[0].data = "Reg No 1, Reg No 2, Reg No 3"

    title_ph = body_ph = None
    for sp in doc.getElementsByTagName('p:sp'):
        ph_nodes = sp.getElementsByTagName('p:ph')
        if ph_nodes:
            ph_type = ph_nodes[0].getAttribute('type')
            if ph_type in ['title', 'ctrTitle']: title_ph = sp
            elif ph_type in ['body', 'subTitle']: body_ph = sp

    if title_ph and data['title']:
        txBody = title_ph.getElementsByTagName('p:txBody')[0]
        for a_p in list(txBody.getElementsByTagName('a:p')): txBody.removeChild(a_p)
        a_p = doc.createElement('a:p')
        pPr = doc.createElement('a:pPr')
        pPr.setAttribute('algn', 'ctr')
        a_p.appendChild(pPr)
        a_p.appendChild(create_text_run(doc, data['title'], sz=3600, b=True))
        txBody.appendChild(a_p)

    if body_ph:
        txBody = body_ph.getElementsByTagName('p:txBody')[0]
        for a_p in list(txBody.getElementsByTagName('a:p')): txBody.removeChild(a_p)
        if data['content']:
            a_p = doc.createElement('a:p')
            a_p.appendChild(create_text_run(doc, data['content'], sz=1800))
            txBody.appendChild(a_p)
        for bullet in data['bullets']:
            a_p = doc.createElement('a:p')
            pPr = doc.createElement('a:pPr')
            pPr.setAttribute('marL', '285750')
            pPr.setAttribute('indent', '-285750')
            buFont = doc.createElement('a:buFont')
            buFont.setAttribute('typeface', 'Arial')
            pPr.appendChild(buFont)
            buChar = doc.createElement('a:buChar')
            buChar.setAttribute('char', '•')
            pPr.appendChild(buChar)
            a_p.appendChild(pPr)
            a_p.appendChild(create_text_run(doc, bullet, sz=1800))
            txBody.appendChild(a_p)
        for metric in data['metrics']:
            a_p = doc.createElement('a:p')
            a_p.appendChild(create_text_run(doc, metric, sz=1800, b=True))
            txBody.appendChild(a_p)

    if data['table']:
        tbls = doc.getElementsByTagName('a:tbl')
        if tbls:
            tbl = tbls[0]
            rows = tbl.getElementsByTagName('a:tr')
            for i in range(len(rows)-1, 0, -1): tbl.removeChild(rows[i])
            for row_data in data['table'][1:]:
                tr = doc.createElement('a:tr')
                tr.setAttribute('h', '400000')
                for cell_text in row_data:
                    tc = doc.createElement('a:tc')
                    txBody = doc.createElement('a:txBody')
                    txBody.appendChild(doc.createElement('a:bodyPr'))
                    txBody.appendChild(doc.createElement('a:lstStyle'))
                    a_p = doc.createElement('a:p')
                    a_p.appendChild(create_text_run(doc, cell_text, sz=1400))
                    txBody.appendChild(a_p)
                    tc.appendChild(txBody)
                    tc.appendChild(doc.createElement('a:tcPr'))
                    tr.appendChild(tc)
                tbl.appendChild(tr)

    with open(xml_path, 'w', encoding='utf-8') as f:
        doc.writexml(f)

def main():
    with open('content.txt', 'r') as f: content = f.read()
    slides_data = parse_content(content)
    for slide_num in range(1, 37):
        if slide_num in slides_data:
            print(f"Filling slide {slide_num}...")
            fill_slide(slide_num, slides_data[slide_num], 'unpacked')
        else:
            xml_path = os.path.join('unpacked', 'ppt', 'slides', f'slide{slide_num}.xml')
            if os.path.exists(xml_path):
                print(f"Setting white color for slide {slide_num}...")
                doc = minidom.parse(xml_path)
                set_white_color(doc)
                with open(xml_path, 'w', encoding='utf-8') as f: doc.writexml(f)

if __name__ == '__main__': main()

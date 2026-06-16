import os
import re
from xml.dom import minidom

def get_text_from_node(node):
    text = ""
    for t in node.getElementsByTagName('a:t'):
        if t.firstChild:
            text += t.firstChild.nodeValue
    return text

def set_text_in_node(node, new_text, color="FFFFFF", bold=False, sz=None):
    # Remove all existing paragraphs
    txBody = node.getElementsByTagName('p:txBody')[0]
    for p in list(txBody.getElementsByTagName('a:p')):
        txBody.removeChild(p)
    
    # Create new paragraphs for each line
    lines = new_text.split('\n')
    for line in lines:
        p = node.ownerDocument.createElement('a:p')
        r = node.ownerDocument.createElement('a:r')
        rPr = node.ownerDocument.createElement('a:rPr')
        rPr.setAttribute('lang', 'en-US')
        if bold: rPr.setAttribute('b', '1')
        if sz: rPr.setAttribute('sz', str(sz))
        
        solidFill = node.ownerDocument.createElement('a:solidFill')
        srgbClr = node.ownerDocument.createElement('a:srgbClr')
        srgbClr.setAttribute('val', color)
        solidFill.appendChild(srgbClr)
        rPr.appendChild(solidFill)
        
        latin = node.ownerDocument.createElement('a:latin')
        latin.setAttribute('typeface', 'Arial')
        rPr.appendChild(latin)
        
        t = node.ownerDocument.createElement('a:t')
        t.appendChild(node.ownerDocument.createTextNode(line))
        
        r.appendChild(rPr)
        r.appendChild(t)
        p.appendChild(r)
        txBody.appendChild(p)

def process_slide(n, title, content, bullets, table_data=None):
    path = f"unpacked/ppt/slides/slide{n}.xml"
    if not os.path.exists(path): return
    
    with open(path, 'r') as f:
        dom = minidom.parse(f)
    
    # Find Title
    title_placed = False
    body_placed = False
    
    for sp in dom.getElementsByTagName('p:sp'):
        ph = sp.getElementsByTagName('p:ph')
        if ph:
            ph_type = ph[0].getAttribute('type')
            if ph_type in ['title', 'ctrTitle'] and not title_placed:
                set_text_in_node(sp, title, color="00D8FF", bold=True, sz=3600)
                title_placed = True
            elif ph_type in ['body', 'obj', 'subTitle'] and not body_placed:
                text = content + ("\n" + "\n".join(["• " + b for b in bullets]) if bullets else "")
                set_text_in_node(sp, text, color="FFFFFF", sz=2000)
                body_placed = True
    
    # Handle Tables
    if table_data:
        tables = dom.getElementsByTagName('a:tbl')
        if tables:
            tbl = tables[0]
            rows = tbl.getElementsByTagName('a:tr')
            for i, row_data in enumerate(table_data):
                if i < len(rows):
                    cells = rows[i].getElementsByTagName('a:tc')
                    for j, cell_text in enumerate(row_data):
                        if j < len(cells):
                            txBody = cells[j].getElementsByTagName('a:txBody')[0]
                            for p in list(txBody.getElementsByTagName('a:p')):
                                txBody.removeChild(p)
                            p = dom.createElement('a:p')
                            r = dom.createElement('a:r')
                            rPr = dom.createElement('a:rPr')
                            rPr.setAttribute('sz', '1400')
                            t = dom.createElement('a:t')
                            t.appendChild(dom.createTextNode(cell_text))
                            r.appendChild(rPr)
                            r.appendChild(t)
                            p.appendChild(r)
                            txBody.appendChild(p)

    with open(path, 'w') as f:
        f.write(dom.toxml())

# Simplified Slide 1 logic
def fix_slide1():
    path = "unpacked/ppt/slides/slide1.xml"
    with open(path, 'r') as f:
        xml = f.read()
    xml = xml.replace('DEPARTMENT OF COMPUTER SCIENCE', 'DEPARTMENT OF COMPUTER SCIENCE AND ENGINEERING')
    xml = xml.replace('TITLE', 'TRUSTLINE')
    xml = xml.replace('STUDENT NAMES (REG NOs)', 'Student 1, Student 2, Student 3')
    xml = xml.replace('GUIDE NAME', 'Assistant Professor')
    xml = xml.replace('BIHER', 'BIHER, Chennai')
    with open(path, 'w') as f:
        f.write(xml)

# Execute
fix_slide1()
# (The rest of the slides would be processed here with the data from content.txt)
print("Slide 1 fixed. Proceeding with others...")

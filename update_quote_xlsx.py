from zipfile import ZipFile, ZIP_DEFLATED
from pathlib import Path
from xml.sax.saxutils import escape

out = Path('/Users/sarah/Documents/日常/manjing-video/漫镜平台报价单.xlsx')
rows = [
    ['漫镜 AI 视频生产平台报价单', '', '', '', ''],
    ['报价口径', 'MVP 标准交付版：3 人左右小团队投入，聚焦核心业务闭环，覆盖登录、多项目、剧本、分镜、素材、AI 视频生成、任务中心与部署支持', '', '', ''],
    ['人天单价', '¥1,980 / 人天', '总人天', '60 人天', '总价 ¥118,800'],
    ['模块', '工作内容', '预估人天', '单价（元/人天）', '小计（元）'],
    ['需求梳理与产品方案', '业务流程梳理、功能边界确认、页面结构规划、核心交互流程设计', 2, 1980, 3960],
    ['登录注册与用户体系', '登录页、注册、登录状态、多用户空间基础设计、后端认证预留', 3, 1980, 5940],
    ['项目管理模块', '新建项目、项目切换、项目首页、项目状态统计、项目数据持久化', 4, 1980, 7920],
    ['剧本工作台', '剧本导入、编辑、保存、项目剧本关联', 3, 1980, 5940],
    ['分镜工作台', '分镜新增、编辑、删除、批量导入、自动拆分镜头、分镜参数设置', 7, 1980, 13860],
    ['视频生成接入', 'Seedance 2.0 接口接入、任务创建、状态轮询、失败处理、结果回写', 7, 1980, 13860],
    ['视频参数面板', '清晰度、画幅、尺寸、秒数等可视化参数配置，并传入生成任务', 3, 1980, 5940],
    ['素材资产库', '图片/视频/音频/Prompt 素材管理、本地预览、公网 URL 绑定、素材选择', 5, 1980, 9900],
    ['丽帧资产库接入', '丽帧资产拉取、资产选择、asset://id 绑定、参考素材传入生成任务', 5, 1980, 9900],
    ['生图工作台', '生图提示词、比例、尺寸、数量、质量配置、结果占位与接口预留', 4, 1980, 7920],
    ['生成任务中心', '任务列表、状态展示、失败/历史任务删除、折叠展示、任务结果追踪', 4, 1980, 7920],
    ['视频资产管理', '已生成视频展示、预览、下载、删除、折叠展示、资产归档', 4, 1980, 7920],
    ['UI 视觉与交互优化', '登录页视觉、工作台布局、卡片、表格、弹窗、基础响应式适配', 4, 1980, 7920],
    ['数据持久化与状态管理', 'MVP 状态管理、本地数据持久化、后续数据库迁移结构预留', 2, 1980, 3960],
    ['测试与联调', '核心功能测试、接口联调、异常场景验证、构建修复、交付检查', 3, 1980, 5940],
    ['部署与交付支持', '本地部署说明、环境变量配置、构建部署、甲方验收支持', 3, 1980, 5940],
    ['合计', '', 60, 1980, 118800],
    ['', '', '', '', ''],
    ['团队配置', '建议 3 人左右执行：产品/项目 1 人、全栈开发 1 人、前端/联调测试 1 人；按模块并行推进，总投入 60 人天。', '', '', ''],
    ['费用说明', '本报价总价 ¥118,800，适用于 MVP 标准交付版，包含产品梳理、开发实现、接口联调、测试与交付支持。', '', '', ''],
    ['范围控制', '为控制人天，本版本优先交付核心流程闭环；高级权限、团队协同、复杂数据看板、SaaS 多租户、高并发架构作为后续二期范围。', '', '', ''],
    ['不包含项', '第三方 AI 生成费用、Seedance/丽帧接口调用费用、云服务器、对象存储、短信验证码、支付系统、大规模并发与多租户 SaaS 架构升级。', '', '', ''],
    ['交付物', 'Web 前端、Next.js API、AI 视频生成流程、素材/视频资产管理、部署说明、验收版本源码或私有化部署。', '', '', ''],
]

strings = []
string_index = {}

def string_id(value):
    value = str(value)
    if value not in string_index:
        string_index[value] = len(strings)
        strings.append(value)
    return string_index[value]

def cell_ref(col, row):
    letters = ''
    while col:
        col, rem = divmod(col - 1, 26)
        letters = chr(65 + rem) + letters
    return f'{letters}{row}'

def cell(value, col, row):
    ref = cell_ref(col, row)
    if isinstance(value, (int, float)):
        return f'<c r="{ref}" s="1"><v>{value}</v></c>'
    return f'<c r="{ref}" t="s" s="1"><v>{string_id(value)}</v></c>'

sheet_rows = []
for row_num, row in enumerate(rows, 1):
    cells = ''.join(cell(value, col_num, row_num) for col_num, value in enumerate(row, 1))
    sheet_rows.append(f'<row r="{row_num}">{cells}</row>')

worksheet = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <cols><col min="1" max="1" width="24"/><col min="2" max="2" width="92"/><col min="3" max="5" width="18"/></cols>
  <sheetData>{''.join(sheet_rows)}</sheetData>
  <mergeCells count="7"><mergeCell ref="A1:E1"/><mergeCell ref="B2:E2"/><mergeCell ref="B23:E23"/><mergeCell ref="B24:E24"/><mergeCell ref="B25:E25"/><mergeCell ref="B26:E26"/><mergeCell ref="B27:E27"/></mergeCells>
</worksheet>'''
shared_strings = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{}" uniqueCount="{}">{}</sst>'.format(len(strings), len(strings), ''.join(f'<si><t>{escape(item)}</t></si>' for item in strings))
styles = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'''
content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'''
rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'''
workbook = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="报价单" sheetId="1" r:id="rId1"/></sheets></workbook>'''
workbook_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'''

with ZipFile(out, 'w', ZIP_DEFLATED) as xlsx:
    xlsx.writestr('[Content_Types].xml', content_types)
    xlsx.writestr('_rels/.rels', rels)
    xlsx.writestr('xl/workbook.xml', workbook)
    xlsx.writestr('xl/_rels/workbook.xml.rels', workbook_rels)
    xlsx.writestr('xl/worksheets/sheet1.xml', worksheet)
    xlsx.writestr('xl/sharedStrings.xml', shared_strings)
    xlsx.writestr('xl/styles.xml', styles)
print(out)

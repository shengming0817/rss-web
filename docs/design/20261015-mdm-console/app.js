/* Standalone interaction prototype. All records are synthetic and memory-only.
 * References: https://linear.app/now/behind-the-latest-design-refresh
 * https://vercel.com/geist/introduction
 * https://learn.jamf.com/r/en-US/jamf-pro-documentation-11.22.0/Policies
 */
'use strict';
const icons = {
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 laptop:'<rect x="4" y="3" width="16" height="13" rx="2"/><path d="m4 16-2 4h20l-2-4M9 20h6"/>',
 box:'<path d="m12 3 9 5v9l-9 5-9-5V8l9-5ZM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5"/>',
 layers:'<path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',down:'<path d="m7 10 5 5 5-5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 activity:'<path d="M2 12h4l3-8 6 16 3-8h4"/>',
 check:'<path d="m5 12 4 4L19 6"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 alert:'<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v.1"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--bg)"/><circle cx="15" cy="17" r="3" fill="var(--bg)"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.1"/>',
 refresh:'<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
 building:'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M10 21v-5h4v5"/>',
 terminal:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 8 4 4-4 4m7 0h3"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
 moon:'<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
 book:'<path d="M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Zm0 0v16"/>',
 link:'<path d="m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
 wifi:'<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0m-4 4v.1"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 filter:'<path d="M4 6h16M7 12h10M10 18h4"/>',
 globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>'
};
const icon = (name) => '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+(icons[name]||icons.box)+'</svg>';
const esc = (v) => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const badge = (text,type='') => '<span class="badge '+type+'"><span class="dot"></span>'+esc(text)+'</span>';
const btn = (text,action,ico='',primary=false,extra='') => '<button class="button '+(primary?'primary':'')+'" data-action="'+action+'" '+extra+'>'+(ico?icon(ico):'')+esc(text)+'</button>';
const appIcon = (type,label='') => '<span class="app-icon '+type+'">'+(type==='chrome'?'':type==='security'?icon('shield'):esc(label))+'</span>';
const avatar = (name) => '<span class="avatar">'+esc(name.slice(-2))+'</span>';
const devices = [
 {id:'mbp-001',name:'Chen 的 MacBook Pro',model:'MacBook Pro 14″ · M3 Pro',os:'macOS',version:'15.6.1',owner:'陈一鸣',dept:'产品设计',status:'attention',issue:'FileVault 未启用',seen:'2 分钟前',serial:'C02X8R01MDM1'},
 {id:'mbp-002',name:'Lin 的 MacBook Air',model:'MacBook Air 13″ · M4',os:'macOS',version:'15.6.1',owner:'林晓',dept:'研发工程',status:'good',seen:'刚刚',serial:'C02X8R02MDM2'},
 {id:'win-003',name:'ENG-SH-023',model:'ThinkPad X1 Carbon',os:'Windows',version:'11 · 24H2',owner:'王辰',dept:'研发工程',status:'good',seen:'1 分钟前',serial:'PF4AB0123'},
 {id:'mbp-004',name:'Xu 的 MacBook Pro',model:'MacBook Pro 16″ · M4 Pro',os:'macOS',version:'15.5',owner:'徐可',dept:'产品设计',status:'attention',issue:'系统更新待安装',seen:'5 分钟前',serial:'C02X8R04MDM4'},
 {id:'win-005',name:'FIN-BJ-008',model:'Surface Laptop 6',os:'Windows',version:'11 · 24H2',owner:'李婧',dept:'财务运营',status:'good',seen:'3 分钟前',serial:'PF4AB0145'},
 {id:'mbp-006',name:'Zhao 的 MacBook Pro',model:'MacBook Pro 14″ · M3',os:'macOS',version:'15.6.1',owner:'赵然',dept:'研发工程',status:'good',seen:'刚刚',serial:'C02X8R06MDM6'},
 {id:'win-007',name:'MKT-SH-012',model:'Dell Latitude 7450',os:'Windows',version:'11 · 23H2',owner:'周悦',dept:'市场营销',status:'offline',issue:'超过 7 天未联系',seen:'8 天前',serial:'DL7X7450012'},
 {id:'mbp-008',name:'Liu 的 MacBook Air',model:'MacBook Air 15″ · M3',os:'macOS',version:'15.6.1',owner:'刘扬',dept:'市场营销',status:'good',seen:'12 分钟前',serial:'C02X8R08MDM8'},
 {id:'win-009',name:'ENG-BJ-036',model:'ThinkPad T14s Gen 5',os:'Windows',version:'11 · 24H2',owner:'许致',dept:'研发工程',status:'good',seen:'4 分钟前',serial:'PF4AB0159'},
 {id:'mbp-010',name:'Wen 的 MacBook Pro',model:'MacBook Pro 14″ · M4',os:'macOS',version:'15.6.1',owner:'温宁',dept:'产品设计',status:'good',seen:'6 分钟前',serial:'C02X8R10MD10'},
 {id:'win-011',name:'OPS-SH-019',model:'Surface Pro 10',os:'Windows',version:'11 · 24H2',owner:'何川',dept:'财务运营',status:'attention',issue:'BitLocker 未启用',seen:'9 分钟前',serial:'SFPRO100019'},
 {id:'mbp-012',name:'Tang 的 MacBook Air',model:'MacBook Air 13″ · M2',os:'macOS',version:'15.6.1',owner:'唐棠',dept:'市场营销',status:'good',seen:'15 分钟前',serial:'C02X8R12MD12'}
];
const software = [
 {name:'Google Chrome',icon:'chrome',mark:'',version:'141.0.7390',category:'浏览器',count:1086,platform:'macOS + Windows',state:'已批准',source:'企业软件目录'},
 {name:'Slack',icon:'slack',mark:'#',version:'4.45.69',category:'团队协作',count:942,platform:'macOS + Windows',state:'已批准',source:'企业软件目录'},
 {name:'Visual Studio Code',icon:'code',mark:'⌘',version:'1.104.2',category:'开发工具',count:486,platform:'macOS + Windows',state:'已批准',source:'企业软件目录'},
 {name:'Zoom Workplace',icon:'zoom',mark:'z',version:'6.6.0',category:'视频会议',count:1012,platform:'macOS + Windows',state:'有更新',source:'企业软件目录'},
 {name:'Figma',icon:'figma',mark:'F',version:'125.2.3',category:'产品设计',count:168,platform:'macOS + Windows',state:'已批准',source:'私有软件包'},
 {name:'RSS Agent',icon:'security',mark:'',version:'2.4.0',category:'设备管理',count:1248,platform:'macOS + Windows',state:'已批准',source:'组织软件仓库'}
];
const policies = [
 {name:'Chrome 安全更新',type:'软件部署',icon:'box',scope:'全部受管设备',count:1248,done:1086,state:'执行中',trigger:'下次设备签入',version:'141.0.7390'},
 {name:'macOS 安全基线',type:'安全配置',icon:'shield',scope:'所有 Mac',count:864,done:852,state:'需关注',trigger:'持续应用',version:'修订 8'},
 {name:'新员工设备初始化',type:'注册配置',icon:'laptop',scope:'新注册设备',count:36,done:36,state:'已完成',trigger:'设备注册后',version:'修订 3'},
 {name:'研发工具包',type:'软件部署',icon:'terminal',scope:'研发工程',count:486,done:486,state:'已完成',trigger:'下次设备签入',version:'修订 6'},
 {name:'Windows 更新环',type:'系统更新',icon:'refresh',scope:'所有 Windows',count:384,done:359,state:'执行中',trigger:'周五 22:00 UTC',version:'24H2'},
 {name:'会议室设备维护',type:'自动化',icon:'clock',scope:'共享设备',count:24,done:0,state:'已暂停',trigger:'每周日 02:00 UTC',version:'修订 2'}
];
let events = [
 {time:'09:42',title:'Chrome 安全更新 · 24 台设备完成安装',detail:'独立检测已确认版本 141.0.7390 · 软件部署',icon:'check',type:'green'},
 {time:'09:36',title:'Lin 的 MacBook Air 完成注册',detail:'自动加入「研发工程」· 初始化策略已分配',icon:'laptop',type:'blue'},
 {time:'09:28',title:'macOS 安全基线发现 12 台加密异常',detail:'FileVault 状态来自设备最新采集 · 等待处理',icon:'shield',type:'amber'},
 {time:'09:15',title:'张明更新了「研发工具包」',detail:'范围：研发工程 · 新增 Visual Studio Code',icon:'layers',type:''},
 {time:'08:54',title:'Zoom Workplace 新版本可发布',detail:'软件来源已校验 · 可由管理员直接发布',icon:'box',type:''}
];
let securityRequests = [
 {name:'设计团队临时提权',detail:'临时权限 · 2 台设备 · 30 分钟',owner:'林晓'},
 {name:'测试设备合规例外',detail:'合规例外 · 1 台设备 · 至 10 月 18 日',owner:'王辰'}
];
const state = {query:'',platform:'all',status:'all',sort:false,selected:new Set(),detailTab:'overview',policyTab:'all',softwareQuery:'',wizard:null,mobile:false,theme:false};
let route = 'overview', routeParams = new URLSearchParams();
const names = {overview:'工作台',devices:'设备',groups:'设备组',policies:'策略与部署',software:'软件目录',security:'安全与合规',activity:'活动记录',design:'设计说明',enrollment:'设备注册'};
const links = [['overview','grid','工作台',''],['devices','laptop','设备','1,248'],['groups','users','设备组',''],['policies','layers','策略与部署',''],['software','box','软件目录',''],['security','shield','安全与合规','37']];
function navItem(id,ico,title,count=''){return '<a class="nav-item '+(route===id||(route==='device'&&id==='devices')?'active':'')+'" href="#'+id+'" '+(route===id?'aria-current="page"':'')+'>'+icon(ico)+'<span>'+title+'</span>'+(count?'<span class="nav-count '+(id==='security'?'alert':'')+'">'+count+'</span>':'')+'</a>';}
function shell(){
 document.getElementById('app').innerHTML='<aside class="sidebar '+(state.mobile?'mobile-open':'')+'"><a class="brand" href="#overview"><span class="brand-mark">r.</span><span class="brand-text">rss</span><span class="brand-tag">MDM</span></a><div class="org"><span class="org-icon">'+icon('building')+'</span><div class="grow"><strong style="font-size:11px;font-weight:550">Acme Technologies</strong><small>企业工作区</small></div>'+icon('down')+'</div><button class="search-trigger" data-action="search">'+icon('search')+'<span>搜索任何内容</span><kbd class="kbd">⌘ K</kbd></button><nav aria-label="主要导航"><div class="nav-label">工作空间</div>'+links.map(x=>navItem(...x)).join('')+'<div class="nav-label">已保存的视图</div><a class="nav-item" href="#devices?view=mac"><span class="pin-dot"></span>所有 Mac</a><a class="nav-item" href="#devices?view=attention"><span class="pin-dot"></span>需要关注的设备</a><a class="nav-item" href="#devices?view=engineering"><span class="pin-dot"></span>研发工程</a></nav><div class="sidebar-bottom">'+navItem('activity','activity','活动记录')+navItem('design','book','设计说明')+'<div class="sidebar-note">设计预览 · 合成数据</div><div class="profile">'+avatar('张明')+'<div class="grow"><div class="profile-name">张明</div><div class="profile-role">工作区管理员</div></div><button class="icon-button" data-action="theme" aria-label="切换明暗主题">'+icon('moon')+'</button></div></div></aside><button class="mobile-backdrop" data-action="menu" aria-label="收起导航" tabindex="-1"></button><div class="shell"><header class="topbar"><div class="breadcrumbs"><button class="icon-button menu-toggle" data-action="menu" aria-label="展开导航" aria-expanded="false">'+icon('menu')+'</button><span class="organization-name">Acme Technologies</span><span class="slash">/</span><span>'+(route==='device'?'设备 / 设备详情':names[route]||'工作台')+'</span></div><div class="top-actions"><span class="prototype">交互原型</span><span class="time-status"><span class="dot green"></span>所有系统运行正常</span><button class="icon-button" data-action="notifications" aria-label="通知">'+icon('bell')+'<span class="notification-dot"></span></button>'+avatar('张明')+'</div></header><main class="main" id="main" tabindex="-1">'+page()+'<footer class="page-footer"><span>RSS MDM · 让每一台设备处于掌控之中</span><span>设计预览 / 2026.10</span></footer></main></div>';
 document.title='RSS — '+(names[route]||'设备详情');
}
function heading(title,sub,actions=''){return '<div class="page-heading"><div><h1>'+title+'</h1><p class="subtitle">'+sub+'</p></div><div class="row">'+actions+'</div></div>';}
function spark(color,n=0){const paths=['0,30 10,25 19,27 28,20 37,23 46,12 55,16 64,8 73,10 84,2','0,27 10,28 19,20 28,23 37,14 46,17 55,9 64,13 73,5 84,6','0,4 10,12 19,7 28,20 37,17 46,24 55,20 64,28 73,24 84,29','0,26 10,22 19,24 28,12 37,17 46,15 55,5 64,9 73,4 84,2'];return '<svg class="sparkline" viewBox="0 0 85 34" aria-hidden="true"><polyline points="'+paths[n]+'" fill="none" stroke="'+color+'" stroke-width="1.5"/></svg>';}
function metric(label,value,foot,ico,link,color,n){return '<a href="'+link+'" class="metric"><div class="metric-label">'+icon(ico)+label+'</div><div class="metric-value">'+value+'</div>'+spark(color,n)+'<div class="metric-foot">'+foot+'</div></a>';}
function overview(){
 return heading('工作台','早上好，张明。你的设备群运行平稳，有几件事需要关注。',btn('活动记录','go-activity','clock')+btn('部署软件','deploy','plus',true))+
 '<div class="between"><div class="tabs grow"><button class="tab active">概览</button></div><span class="time-status" style="margin-bottom:24px">10 月 15 日，星期四 · UTC</span></div>'+
 '<div class="metrics">'+metric('受管设备','1,248','<strong>↗ 24</strong> 较上周新增','laptop','#devices','#81858f',0)+metric('设备合规率','95.6<small>%</small>','<strong>↗ 2.4%</strong> 较上周提升','shield','#security','#74a793',1)+metric('需要关注','37','<span class="amber">12 项高优先级</span> · 查看风险','alert','#security','#c4a477',2)+metric('软件覆盖率','98.2<small>%</small>','<strong>↗ 1.8%</strong> 较上周提升','box','#software','#8e98b8',3)+'</div>'+
 '<div class="overview-grid"><section class="panel"><div class="panel-head"><div><h2>需要你关注 <span class="inline-count">3</span></h2><div class="panel-sub">按影响范围与优先级排列</div></div><a class="text-button" href="#security">查看全部 '+icon('arrow')+'</a></div><div class="task-list">'+
 task('shield','red','12 台 Mac 尚未启用磁盘加密','安全基线 · FileVault 保护未生效','review-encryption')+
 task('refresh','amber','Chrome 更新在 8 台设备上暂停','软件部署 · 需要用户退出正在运行的应用','policy-detail','0')+
 task('clock','', '18 台设备超过 7 天未联系','设备健康 · 建议确认设备使用状态','offline')+'</div><div class="panel-foot">'+icon('shield')+'以设备最新上报为准 · 执行成功后仍需确认实际效果</div></section>'+
 '<section class="panel"><div class="panel-head"><h2>设备群概览</h2><a href="#devices" class="text-button" aria-label="查看全部设备">'+icon('arrow')+'</a></div><div class="fleet-body"><div class="fleet-visual"><div class="donut"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="48" fill="none" stroke="var(--hover)" stroke-width="9"/><circle cx="60" cy="60" r="48" fill="none" stroke="#5a6378" stroke-width="9" stroke-dasharray="205 302" stroke-linecap="round"/><circle cx="60" cy="60" r="48" fill="none" stroke="#b7bfce" stroke-width="9" stroke-dasharray="86 302" stroke-dashoffset="-212" stroke-linecap="round"/></svg><div class="donut-label"><strong>1,248</strong><small>受管设备</small></div></div><div class="legend"><div class="legend-row"><i class="legend-square" style="background:#5a6378"></i>macOS<strong>864</strong></div><div class="legend-row"><i class="legend-square" style="background:#b7bfce"></i>Windows<strong>384</strong></div><div class="legend-row muted tiny">覆盖 8 个部门</div></div></div><div class="between tiny"><span>设备状态</span><span class="muted">95.6% 健康</span></div><div class="segmented-bar"><span style="width:95.6%;background:#70a58d"></span><span style="width:3%;background:#d6b16b"></span><span style="width:1.4%;background:#c5c7cf"></span></div><div class="fleet-breakdown"><span><i class="dot green"></i> 健康 1,193</span><span><i class="dot amber"></i> 关注 37</span><span><i class="dot muted"></i> 离线 18</span></div></div></section></div>'+
 '<div class="overview-grid"><section class="panel"><div class="panel-head"><div><h2>正在部署</h2><div class="panel-sub">从分配到实际安装，跟踪每一步</div></div><a class="text-button" href="#policies">所有部署 '+icon('arrow')+'</a></div><div class="deployment-list">'+deployment('chrome','','Chrome 安全更新','全部受管设备 · 版本 141.0.7390',1086,1248,0)+deployment('security','','macOS 安全基线','所有 Mac · 持续应用',852,864,1)+deployment('code','⌘','研发工具包','研发工程 · 3 个软件',486,486,3)+'</div></section><section class="panel"><div class="panel-head"><h2>最近活动</h2><a href="#activity" class="text-button">全部 '+icon('arrow')+'</a></div><div class="activity-list"><div class="activity-item">'+avatar('林晓')+'<div><strong>Lin 的 MacBook Air</strong> 已加入管理<small>自动注册 · 6 分钟前</small></div></div><div class="activity-item">'+avatar('张明')+'<div><strong>你</strong> 更新了研发工具包<small>策略配置 · 27 分钟前</small></div></div><div class="activity-item"><span class="avatar">'+icon('box')+'</span><div><strong>24 台设备</strong> 已完成 Chrome 更新<small>效果已验证 · 42 分钟前</small></div></div></div></section></div>';
}
function task(ico,type,title,detail,action,id=''){return '<div class="task"><span class="task-icon '+type+'">'+icon(ico)+'</span><div class="grow"><div class="task-title">'+title+'</div><div class="task-detail">'+detail+'</div></div><button class="icon-button" data-action="'+action+'" data-id="'+id+'" aria-label="'+title+'">'+icon('chevron')+'</button></div>';}
function deployment(type,mark,title,sub,done,count,id){return '<div class="deployment">'+appIcon(type,mark)+'<div><button class="device-link" data-action="policy-detail" data-id="'+id+'"><span class="task-title">'+title+'</span></button><p class="task-detail">'+sub+'</p></div><div><div class="deployment-number"><span '+(done===count?'class="green"':'')+'>'+done.toLocaleString()+'</span> <span class="muted">/ '+count.toLocaleString()+'</span></div><div class="progress-track"><span style="width:'+done/count*100+'%"></span></div></div></div>';}
function deviceRows(){
 let result=devices.filter(d=>(state.platform==='all'||d.os===state.platform)&&(state.status==='all'||d.status===state.status)&&(!state.query||[d.name,d.owner,d.serial,d.dept].join(' ').toLowerCase().includes(state.query.toLowerCase()))&&(routeParams.get('view')!=='engineering'||d.dept==='研发工程')&&(routeParams.get('view')!=='encryption'||d.issue==='FileVault 未启用'));
 if(state.sort)result.sort((a,b)=>a.name.localeCompare(b.name));
 return result;
}
function deviceTable(){
 const result=deviceRows();
 return (state.selected.size?'<div class="bulkbar"><span>已选择 '+state.selected.size+' 台设备</span><span class="grow"></span>'+btn('分配策略','bulk-policy','layers')+btn('更新资产信息','bulk-sync','refresh')+'<button class="icon-button" style="color:white" data-action="clear-selection" aria-label="取消选择">'+icon('close')+'</button></div>':'')+
 '<div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="select-all" aria-label="选择当前筛选结果" '+(result.length&&result.every(d=>state.selected.has(d.id))?'checked':'')+'></th><th><button data-action="sort">设备名称 '+(state.sort?'↑':'↓')+'</button></th><th>用户 / 部门</th><th>操作系统</th><th>健康状态</th><th>最近联系</th><th></th></tr></thead><tbody>'+
 result.map(d=>'<tr><td><input type="checkbox" data-select="'+d.id+'" aria-label="选择 '+esc(d.name)+'" '+(state.selected.has(d.id)?'checked':'')+'></td><td><a href="#device?id='+d.id+'" class="device-cell device-link"><span class="device-mini">'+icon('laptop')+'</span><span><span class="device-name">'+esc(d.name)+'</span><span class="device-model">'+d.model+'</span></span></a></td><td><div class="user-cell">'+avatar(d.owner)+'<div>'+d.owner+'<span class="device-model">'+d.dept+'</span></div></div></td><td>'+d.os+'<span class="device-model">'+d.version+'</span></td><td>'+badge(d.status==='good'?'健康':d.status==='offline'?'离线':'需关注',d.status==='good'?'good':d.status==='offline'?'':'warn')+(d.issue?'<span class="device-model">'+d.issue+'</span>':'')+'</td><td class="muted">'+d.seen+'</td><td><a class="icon-button" href="#device?id='+d.id+'" aria-label="查看 '+esc(d.name)+'">'+icon('chevron')+'</a></td></tr>').join('')+'</tbody></table>'+(result.length?'':'<div class="empty">'+icon('search')+'<h3>没有匹配的设备</h3><p>尝试其他设备名称、用户或筛选条件。</p></div>')+'</div><div class="table-footer"><span>显示 '+result.length+' 台示例设备'+(state.selected.size?' · 已选择 '+state.selected.size+' 台':'')+'</span><span>完整设备群：1,248 台 · 当前为设计数据集</span></div>';
}
function devicesPage(){
 return heading('设备','在一个地方了解、管理和保护所有终端。',btn('导出','export','download')+btn('注册设备','enroll','plus',true))+
 '<div class="tabs"><a class="tab active" href="#devices">全部设备 <span class="tab-count">1,248</span></a><a class="tab" href="#groups">设备组</a><a class="tab" href="#enrollment">注册记录</a></div><div class="saved-views"><a class="view-chip '+(!routeParams.get('view')?'active':'')+'" href="#devices">'+icon('grid')+'全部设备</a><a class="view-chip '+(routeParams.get('view')==='mac'?'active':'')+'" href="#devices?view=mac">所有 Mac <span class="muted">864</span></a><a class="view-chip '+(routeParams.get('view')==='attention'?'active':'')+'" href="#devices?view=attention"><i class="dot amber"></i>需要关注</a><a class="view-chip '+(routeParams.get('view')==='engineering'?'active':'')+'" href="#devices?view=engineering">研发工程</a></div><div class="toolbar"><label class="search-field">'+icon('search')+'<input id="device-search" placeholder="搜索设备、用户或序列号…" aria-label="搜索设备" value="'+esc(state.query)+'"></label><select class="filter" id="platform-filter" aria-label="操作系统"><option value="all">所有操作系统</option><option '+(state.platform==='macOS'?'selected':'')+'>macOS</option><option '+(state.platform==='Windows'?'selected':'')+'>Windows</option></select><select class="filter" id="status-filter" aria-label="健康状态"><option value="all">所有状态</option><option value="good" '+(state.status==='good'?'selected':'')+'>健康</option><option value="attention" '+(state.status==='attention'?'selected':'')+'>需关注</option><option value="offline" '+(state.status==='offline'?'selected':'')+'>离线</option></select><span class="grow"></span><span class="time-status">'+icon('refresh')+'2 分钟前更新</span></div><div id="device-results">'+deviceTable()+'</div>';
}
function fact(label,value){return '<div><div class="fact-label">'+label+'</div><div class="fact-value">'+value+'</div></div>';}
function deviceDetail(){
 const d=devices.find(x=>x.id===routeParams.get('id'))||devices[0];
 const detailTabs=[['overview','概览'],['inventory','资产信息'],['software','已安装软件'],['security','安全'],['history','管理记录']];
 let content='';
 if(state.detailTab==='overview'||state.detailTab==='inventory'){
 content='<div class="detail-grid"><section class="panel"><div class="panel-head"><h2>设备信息</h2><span class="muted tiny">最新设备采集</span></div><div class="facts">'+fact('设备型号',d.model)+fact('操作系统',d.os+' '+d.version)+fact('序列号','<span class="mono">'+d.serial+'</span>')+fact('设备所有权','企业所有')+fact('处理器',d.os==='macOS'?'Apple Silicon':'Intel Core Ultra 7')+fact('内存 / 存储',d.os==='macOS'?'18 GB / 512 GB':'16 GB / 512 GB')+fact('注册方式',d.os==='macOS'?'自动设备注册（ADE）':'组织设备注册')+fact('首次注册','2026 年 9 月 12 日')+'</div></section><section class="panel"><div class="panel-head"><h2>用户与归属</h2></div><div style="padding:0 20px 20px"><div class="row" style="margin-bottom:22px">'+avatar(d.owner)+'<div><strong style="font-weight:550">'+d.owner+'</strong><p class="tiny muted">'+d.dept+' · 上海办公室</p></div></div><div class="facts" style="padding:0">'+fact('部门',d.dept)+fact('管理组','<a href="#groups">查看关联设备组 →</a>')+fact('MDM 通道',badge(d.status==='offline'?'离线':'已连接',d.status==='offline'?'':'good'))+fact('Agent 通道',badge(d.status==='offline'?'离线':'已连接',d.status==='offline'?'':'good'))+'</div></div></section></div><div class="detail-grid section-gap"><section class="panel"><div class="panel-head"><h2>安全状态</h2><button class="text-button" data-action="detail-tab" data-id="security">查看详情 '+icon('arrow')+'</button></div>'+securityChecks(d)+'</section><section class="panel"><div class="panel-head"><h2>最近管理活动</h2></div><div class="activity-list"><div class="activity-item"><span class="task-icon">'+icon('refresh')+'</span><div>资产信息已更新<small>'+d.seen+' · 设备自动上报</small></div></div><div class="activity-item"><span class="task-icon">'+icon('box')+'</span><div>Google Chrome 更新完成<small>今天 08:30 · 效果已验证</small></div></div></div></section></div>';
 }else if(state.detailTab==='software'){content='<section class="panel"><div class="panel-head"><h2>已安装软件</h2><span class="muted tiny">来自设备软件清单</span></div><div class="deployment-list">'+software.slice(0,4).map(a=>'<div class="deployment">'+appIcon(a.icon,a.mark)+'<div><strong style="font-weight:500">'+a.name+'</strong><p class="task-detail">'+a.version+'</p></div>'+badge('版本合规','good')+'</div>').join('')+'</div></section>';}
 else if(state.detailTab==='security'){content='<section class="panel"><div class="panel-head"><h2>安全基线检查</h2><span class="tiny muted">最近评估：'+d.seen+'</span></div>'+securityChecks(d)+'</section>';}
 else content='<section class="panel"><div class="panel-head"><h2>设备管理记录</h2></div>'+timeline(events.slice(0,3))+'</section>';
 return '<a href="#devices" class="text-button" style="margin-bottom:20px">← 返回设备列表</a><div class="detail-header"><span class="device-hero">'+icon('laptop')+'</span><div class="grow"><h1>'+d.name+'</h1><div class="detail-meta">'+badge(d.status==='good'?'健康':d.status==='offline'?'离线':'需关注',d.status==='good'?'good':d.status==='offline'?'':'warn')+'<span>'+d.model+'</span><span>'+d.owner+'</span></div></div>'+btn('更新资产','sync-device','refresh')+'</div><div class="tabs">'+detailTabs.map(([id,label])=>'<button class="tab '+(state.detailTab===id?'active':'')+'" data-action="detail-tab" data-id="'+id+'">'+label+'</button>').join('')+'</div>'+(d.status==='attention'?'<div class="notice">'+icon('alert')+'<div class="grow"><strong>'+d.issue+'</strong><div class="tiny">设备尚未达到组织安全基线，请分配相应整改策略。</div></div>'+btn('分配整改策略','remediate','shield')+'</div>':'')+content;
}
function securityChecks(d){return '<div class="checklist">'+[['磁盘加密',d.issue&&d.issue.includes('未启用')?'未启用':'已启用'],['防火墙','已启用'],[d.os==='macOS'?'系统完整性保护':'安全启动','已启用'],['操作系统版本',d.issue==='系统更新待安装'?'待更新':'符合要求']].map(([k,v])=>'<div class="check-row"><span>'+k+'</span>'+badge(d.status==='offline'?'待设备更新':v,d.status==='offline'?'':v==='未启用'||v==='待更新'?'warn':'good')+'</div>').join('')+'</div>';}
function policiesPage(){
 const p=state.policyTab==='all'?policies:policies.filter(x=>x.state===state.policyTab);
 return heading('策略与部署','定义期望状态，选择目标设备，持续跟踪实际效果。',btn('新建部署','deploy','plus',true))+
 '<div class="tabs">'+[['all','全部策略'],['待执行','待执行'],['执行中','执行中'],['需关注','需关注'],['已完成','已完成']].map(([id,label])=>'<button class="tab '+(state.policyTab===id?'active':'')+'" data-action="policy-tab" data-id="'+id+'">'+label+' <span class="tab-count">'+(id==='all'?policies.length:policies.filter(x=>x.state===id).length)+'</span></button>').join('')+'</div><div class="policy-list">'+p.map(x=>'<article class="policy-card"><span class="policy-icon">'+icon(x.icon)+'</span><div class="grow"><button class="device-link" data-action="policy-detail" data-id="'+policies.indexOf(x)+'"><span class="policy-title">'+esc(x.name)+'</span></button><div class="policy-meta"><span>'+x.type+'</span><span>'+esc(x.scope)+'</span><span>'+x.trigger+'</span></div></div><div class="policy-progress"><div class="between tiny"><span class="muted">效果已验证</span><span>'+x.done+' / '+x.count+'</span></div><div class="progress-track"><span style="width:'+x.done/x.count*100+'%"></span></div></div>'+badge(x.state,x.state==='已完成'?'good':x.state==='需关注'?'warn':x.state==='执行中'?'info':'')+'<button class="icon-button" data-action="policy-detail" data-id="'+policies.indexOf(x)+'" aria-label="查看 '+esc(x.name)+'">'+icon('chevron')+'</button></article>').join('')+(p.length?'':'<div class="empty">当前没有此状态的策略。</div>')+'</div>';
}
function softwareCards(){
 const filtered=software.filter(a=>(a.name+' '+a.category).toLowerCase().includes(state.softwareQuery.toLowerCase()));
 return filtered.map((a)=>'<article class="software-card"><div class="between">'+appIcon(a.icon,a.mark)+badge(a.state,a.state==='有更新'?'info':'good')+'</div><h3>'+a.name+'</h3><p class="software-description">'+a.category+' · '+a.platform+'</p><div class="software-stats"><span>版本 <strong>'+a.version+'</strong></span><span><strong>'+a.count.toLocaleString()+'</strong> 台已安装</span></div>'+btn('部署到设备','deploy-app','plus',false,'data-id="'+software.indexOf(a)+'"')+'</article>').join('')||( '<div class="empty">没有匹配的软件。</div>');
}
function softwarePage(){
 return heading('软件目录','经过组织批准的软件，随时部署到合适的设备。',btn('软件来源','sources','box'))+'<div class="tabs"><button class="tab active">组织软件 <span class="tab-count">6</span></button></div><div class="toolbar"><label class="search-field">'+icon('search')+'<input id="software-search" placeholder="搜索软件名称或分类…" aria-label="搜索软件" value="'+esc(state.softwareQuery)+'"></label><span class="grow"></span><span class="tiny muted">已校验的软件来源 · 跨平台管理</span></div><div class="software-grid" id="software-results">'+softwareCards()+'</div>';
}
function securityPage(){return heading('安全与合规','从风险发现到整改验证，让设备回到安全状态。',btn('查看基线','baselines','shield'))+'<div class="metrics">'+metric('合规设备','1,193','已通过全部适用基线','shield','#devices?view=healthy','#74a793',1)+metric('需整改设备','37','12 台磁盘加密 · 25 台系统更新','alert','#devices?view=attention','#c4a477',2)+metric('待审批例外',String(securityRequests.filter(a=>a.name.includes('例外')).length),'临时例外需设置到期时间','clock','#security','#8e98b8',0)+metric('离线待确认','18','超过 7 天未收到设备信息','wifi','#devices?view=offline','#999ca5',2)+'</div><section class="panel"><div class="panel-head"><div><h2>待处理风险</h2><p class="panel-sub">按设备实际检测结果评估</p></div><span class="badge">3 项风险</span></div><div class="task-list">'+task('lock','red','磁盘加密未启用','高优先级 · 12 台 Mac · macOS 安全基线','review-encryption')+task('refresh','amber','Windows 版本未达到组织要求','中优先级 · 18 台设备 · Windows 安全基线','windows-risk')+task('refresh','amber','macOS 系统更新待安装','中优先级 · 7 台设备 · macOS 安全基线','mac-risk')+'</div></section><section class="panel section-gap"><div class="panel-head"><h2>例外与审批</h2><button class="text-button" data-action="securityRequests">查看审批 '+icon('arrow')+'</button></div><div class="panel-foot">'+icon('clock')+'临时例外会在到期后重新评估，不改变原始设备检测结果。</div></section>';}
function groupsPage(){const gs=[['所有 Mac','864','操作系统 = macOS','动态设备组','mac'],['所有 Windows','384','操作系统 = Windows','动态设备组','windows'],['研发工程','486','部门 = 研发工程','动态设备组','engineering'],['需要关注的设备','37','健康状态 = 需关注','动态设备组','attention']];
 return heading('设备组','按设备属性自动归组，持续保持部署范围准确。')+'<div class="group-grid">'+gs.map(([name,num,criteria,type,view])=>'<article class="group-card"><div class="between"><div class="row">'+icon('users')+'<h2>'+name+'</h2></div><span class="badge">'+type+'</span></div><div class="group-number">'+num+' <span class="tiny muted">台设备</span></div><div class="criteria-chip">'+criteria+'</div><div class="between" style="margin-top:21px"><span class="tiny muted">随设备信息自动更新</span><a href="#devices?view='+view+'" class="text-button">查看设备 '+icon('arrow')+'</a></div></article>').join('')+'</div>';}
function timeline(items){return '<div class="timeline">'+items.map(e=>'<div class="timeline-item"><span class="timeline-time">'+e.time+' UTC</span><span class="task-icon '+e.type+'">'+icon(e.icon)+'</span><div><h3>'+esc(e.title)+'</h3><p>'+esc(e.detail)+'</p></div></div>').join('')+'</div>';}
function activityPage(){return heading('活动记录','设备变化、管理员操作和部署结果，按时间串联。',btn('导出记录','export-activity','download'))+'<div class="tabs"><span class="tab active">全部活动</span></div><section class="panel"><div class="panel-head"><h2>2026 年 10 月 15 日</h2><span class="tiny muted">UTC · '+events.length+' 条记录</span></div>'+timeline(events)+'</section>';}
function enrollmentPage(){return heading('设备注册','为新设备准备清晰、可重复的入职流程。',btn('创建注册邀请','invite','plus',true))+'<div class="group-grid"><section class="group-card"><div class="row">'+icon('laptop')+'<h2>自动设备注册</h2></div><p class="subtitle">企业设备开箱即用，自动应用组织配置。</p><div class="selection-summary"><div class="summary-line"><span>Apple Business Manager</span>'+badge('已连接','good')+'</div><div class="summary-line"><span>默认初始化策略</span><span>新员工设备初始化</span></div></div>'+btn('查看初始化策略','policy-detail','arrow',false,'data-id="2"')+'</section><section class="group-card"><div class="row">'+icon('link')+'<h2>邀请注册</h2></div><p class="subtitle">向设备使用者提供注册指引与安装入口。</p><div class="selection-summary"><div class="summary-line"><span>支持平台</span><span>macOS / Windows</span></div><div class="summary-line"><span>设备所有权</span><span>企业所有</span></div></div>'+btn('创建邀请','invite','plus')+'</section></div><section class="panel section-gap"><div class="panel-head"><h2>最近注册</h2></div>'+timeline(events.filter(e=>e.icon==='laptop'))+'</section>';}
function designPage(){return heading('以管理员的工作为中心','RSS MDM · 交互与视觉设计说明')+'<div class="detail-grid"><section class="panel"><div class="panel-head"><h2>三个参考，各自解决一个问题</h2></div><div style="padding:0 20px 20px"><div class="check-row"><div><strong>Jamf · 管理工作流</strong><p class="subtitle">资产 → 智能设备组 → 策略范围 → 执行与验证。</p></div></div><div class="check-row"><div><strong>Linear · 信息层次</strong><p class="subtitle">弱化导航、紧凑列表、固定操作位置与全局搜索。</p></div></div><div class="check-row"><div><strong>Vercel · 视觉语言</strong><p class="subtitle">中性色阶、细边框、清晰排版、克制的组件形态。</p></div></div><div class="design-links"><a href="https://linear.app/now/behind-the-latest-design-refresh" target="_blank" rel="noreferrer">Linear 设计参考 ↗</a><a href="https://vercel.com/geist/introduction" target="_blank" rel="noreferrer">Geist 设计系统 ↗</a><a href="https://learn.jamf.com/r/en-US/jamf-pro-documentation-11.22.0/Policies" target="_blank" rel="noreferrer">Jamf 策略工作流 ↗</a></div></div></section><section class="panel"><div class="panel-head"><h2>设计规范</h2></div><div style="padding:0 20px 20px"><p class="subtitle">218px 侧栏 / 58px 顶栏 / 4px 间距基准<br>27px 页面标题 / 13px 正文 / 10–11px 辅助信息<br>状态同时使用文字、图形和颜色表达。</p><div class="token-grid"><div class="token" style="background:#252629;color:white">主操作</div><div class="token" style="background:#edf8f2;color:#218262">正常</div><div class="token" style="background:#fff7e9;color:#a96c16">关注</div><div class="token" style="background:#fdf0f0;color:#cc5356">风险</div></div></div></section></div><section class="panel section-gap"><div class="panel-head"><h2>预览范围</h2></div><div style="padding:0 20px 23px;color:var(--muted);font-size:12px;line-height:1.9">这是独立、可点击的设计原型，使用合成设备与业务数据。支持搜索筛选、设备详情、批量选择、三步部署、审批和明暗主题。所有操作仅改变当前页面内存，刷新后重置；不会连接真实服务或执行设备命令。<br>交互设计、真实接口联调、设备效果验收分别完成。正式落地继续复用现有会话、授权、冲突处理和业务客户端。</div></section>';}
function page(){return ({overview,devices:devicesPage,device:deviceDetail,policies:policiesPage,software:softwarePage,security:securityPage,groups:groupsPage,activity:activityPage,design:designPage,enrollment:enrollmentPage}[route]||overview)();}
function navigate(){
 const [path,query='']=(location.hash.slice(1)||'overview').split('?');route=path;routeParams=new URLSearchParams(query);
 if(route==='devices'){state.query='';state.selected.clear();const view=routeParams.get('view');state.platform=view==='mac'?'macOS':view==='windows'||view==='windows-risk'?'Windows':view==='encryption'?'macOS':'all';state.status=['attention','encryption','windows-risk'].includes(view)?'attention':view==='offline'?'offline':view==='healthy'?'good':'all';}
 if(route==='device')state.detailTab='overview';state.mobile=false;shell();window.scrollTo(0,0);
}
function go(hash){if(location.hash==='#'+hash){navigate();}else location.hash=hash;}
function refreshDevices(){document.getElementById('device-results').innerHTML=deviceTable();}
let toastTimer;function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4000);}
const dialog=document.getElementById('dialog');
function openDialog(title,body,footer=''){dialog.innerHTML='<div class="dialog-head"><h2 id="dialog-title">'+title+'</h2><button class="icon-button" data-action="close" aria-label="关闭对话框">'+icon('close')+'</button></div><div class="dialog-body">'+body+'</div>'+(footer?'<div class="dialog-footer">'+footer+'</div>':'');if(!dialog.open)dialog.showModal();}
function closeDialog(){dialog.close();state.wizard=null;}
function openSearch(){openDialog('快速查找','<label class="search-field" style="width:100%">'+icon('search')+'<input id="command-search" placeholder="搜索设备、软件或工作区…" aria-label="全局搜索"></label><div id="command-results" class="command-results">'+searchResults('')+'</div>','<span class="tiny muted">输入搜索 · Tab 选择 · Enter 打开</span><kbd class="kbd">Esc 关闭</kbd>');document.getElementById('command-search').focus();}
function searchResults(query){const targets=[...links.map(([id,ico,name])=>({name,ico,type:'工作区',hash:id})),...devices.map(d=>({name:d.name,ico:'laptop',type:d.owner,hash:'device?id='+d.id})),...software.map(s=>({name:s.name,ico:'box',type:'软件',hash:'software'}))].filter(x=>(x.name+x.type).toLowerCase().includes(query.toLowerCase())).slice(0,10);return targets.map(x=>'<button class="command-item" data-action="search-go" data-id="'+x.hash+'">'+icon(x.ico)+esc(x.name)+'<small>'+x.type+' '+icon('arrow')+'</small></button>').join('')||'<div class="empty">没有找到相关内容</div>';}
function startWizard(app=0,target='all',custom=''){state.wizard={step:1,app,scope:target,name:custom||software[app].name+' 部署',timing:'checkin',custom};renderWizard();}
function renderWizard(){
 const w=state.wizard;const a=software[w.app];
 const steps='<div class="steps">'+['选择内容','选择设备','确认部署'].map((x,i)=>'<div class="step '+(w.step===i+1?'current':'')+'"><b>'+(w.step>i+1?'✓':i+1)+'</b>'+x+'</div>').join('')+'</div>';
 let body='';
 if(w.step===1)body='<label class="field">部署名称<input id="deploy-name" maxlength="80" value="'+esc(w.name)+'"></label>'+(w.custom?'<div class="selection-summary"><div class="row">'+icon('shield')+'<strong>'+esc(w.custom)+'</strong></div><p class="subtitle">启用组织安全基线要求的设备保护。设备后续上报将用于确认效果。</p></div>':'<label class="field">选择组织软件<select id="deploy-app">'+software.map((s,i)=>'<option value="'+i+'" '+(i===w.app?'selected':'')+'>'+s.name+' · '+s.version+'</option>').join('')+'</select></label><div class="selection-summary"><div class="row">'+appIcon(a.icon,a.mark)+'<div><strong>'+a.name+'</strong><div class="tiny muted">'+a.platform+' · 已批准版本 '+a.version+'</div></div></div></div>')+'<p class="wizard-note">'+icon('shield')+'仅部署组织已批准的软件和配置。</p>';
 if(w.step===2)body='<h3>将此部署分配给哪些设备？</h3><p class="subtitle">使用设备组持续管理范围，或选择当前设备。</p>'+[['all','全部受管设备','1,248 台 · 随注册设备自动更新'],['mac','所有 Mac','864 台 · 动态设备组'],['engineering','研发工程','486 台 · 按部门自动归组'],...(state.selected.size?[['selected','已选择的设备',state.selected.size+' 台 · 来自设备列表']]:[]),...(route==='device'?[['device','当前设备','1 台 · '+(devices.find(x=>x.id===routeParams.get('id'))||devices[0]).name]]:[])].map(([value,title,sub])=>'<label class="choice"><input type="radio" name="deploy-scope" value="'+value+'" '+(w.scope===value?'checked':'')+'><span>'+title+'<small>'+esc(sub)+'</small></span></label>').join('')+'<p class="wizard-note">'+icon('users')+'正式部署前由服务端校验目标权限、平台兼容性与最新范围。</p>';
 if(w.step===3)body='<div class="selection-summary"><div class="summary-line"><span>部署</span><strong>'+esc(w.name)+'</strong></div><div class="summary-line"><span>内容</span><span>'+esc(w.custom||a.name+' '+a.version)+'</span></div><div class="summary-line"><span>目标范围</span><span>'+scopeName(w.scope)+' · '+scopeCount(w.scope)+' 台</span></div></div><h3>执行时间</h3><label class="choice"><input type="radio" name="deploy-timing" value="checkin" '+(w.timing==='checkin'?'checked':'')+'><span>下次设备签入时<small>离线设备将在重新连接后接收部署。</small></span></label><label class="choice"><input type="radio" name="deploy-timing" value="maintenance" '+(w.timing==='maintenance'?'checked':'')+'><span>维护窗口<small>2026 年 10 月 16 日 22:00 UTC 开始。</small></span></label><p class="wizard-note">'+icon('help')+'创建后先显示待执行。设备回执与实际效果分开记录。此预览不会发送真实命令。</p>';
 openDialog(w.custom?'分配整改策略':'新建软件部署',steps+body,(w.step===1?btn('取消','close'):btn('上一步','wizard-back'))+'<span class="grow"></span>'+btn(w.step===3?'创建部署':'下一步',w.step===3?'wizard-submit':'wizard-next',w.step===3?'check':'arrow',true));
}
function scopeName(scope){return {all:'全部受管设备',mac:'所有 Mac',engineering:'研发工程',selected:'已选择的设备',device:'当前设备'}[scope]||'全部受管设备';}
function scopeCount(scope){return {all:1248,mac:864,engineering:486,selected:state.selected.size,device:1}[scope]||1248;}
function record(title,detail,ico='layers'){events.unshift({time:'09:48',title,detail,icon:ico,type:''});}
function submitWizard(){
 const w=state.wizard;if(!w.name.trim()){toast('请填写部署名称');return;}const count=scopeCount(w.scope);
 policies.unshift({name:w.name,type:w.custom?'安全配置':'软件部署',icon:w.custom?'shield':'box',scope:scopeName(w.scope),count,done:0,state:'待执行',trigger:w.timing==='checkin'?'下次设备签入':'10 月 16 日 22:00 UTC',version:software[w.app].version});
 record('已创建部署：'+w.name,'目标 '+count+' 台 · 等待设备接收 · 当前为原型演示');
 openDialog('部署已创建','<div class="success-state"><div class="success-icon">'+icon('check')+'</div><h3>'+esc(w.name)+'</h3><p>已分配到 '+count+' 台设备，等待设备接收。</p>'+badge('待执行','info')+'<div class="selection-summary"><div class="summary-line"><span>设备已接收</span><span>0 / '+count+'</span></div><div class="summary-line"><span>效果已验证</span><span>0 / '+count+'</span></div></div><p class="tiny">这是交互预览，未发送真实设备命令。</p></div>',btn('关闭','close')+btn('查看部署','created-policy','arrow',true));state.wizard=null;
}
function policyDetail(id){
 const p=policies[Number(id)];if(!p)return;
 const paused=p.name==='Chrome 安全更新';
 openDialog(p.name,'<div class="row">'+badge(p.state,p.state==='已完成'?'good':p.state==='需关注'?'warn':'info')+'<span class="muted tiny">'+esc(p.type)+' · '+esc(p.version)+'</span></div><div class="selection-summary"><div class="summary-line"><span>目标范围</span><span>'+esc(p.scope)+' · '+p.count+' 台</span></div><div class="summary-line"><span>执行时机</span><span>'+p.trigger+'</span></div><div class="summary-line"><span>设备已接收</span><span>'+Math.min(p.count,p.done+(p.done?12:0))+' / '+p.count+'</span></div><div class="summary-line"><span>效果已验证</span><strong class="green">'+p.done+' / '+p.count+'</strong></div><div class="progress-track"><span style="width:'+p.done/p.count*100+'%"></span></div></div>'+(paused?'<div class="notice">'+icon('alert')+'<div>8 台设备等待用户退出 Chrome。<div class="tiny">保持现有版本可用，在用户退出后继续安装。</div></div></div>':'')+'<h3>执行与结果</h3><div class="checklist" style="padding:0"><div class="check-row"><span>分配策略</span>'+badge('已完成','good')+'</div><div class="check-row"><span>设备执行</span>'+badge(p.done===p.count?'已完成':'持续跟踪',p.done===p.count?'good':'info')+'</div><div class="check-row"><span>独立效果检测</span><span class="muted tiny">'+p.done+' 台已验证</span></div></div>',btn('关闭','close')+btn('查看活动','modal-activity','arrow',true));
}
function securityRequestsDialog(){openDialog('安全申请',securityRequests.length?'<p class="subtitle" style="margin-bottom:16px">审核影响范围后批准。批准不会直接代表设备执行成功。</p>'+securityRequests.map((a,i)=>'<div class="task"><span class="task-icon">'+icon('shield')+'</span><div class="grow"><div class="task-title">'+a.name+'</div><div class="task-detail">'+a.detail+' · '+a.owner+'</div></div>'+btn('审核','review-approval','',false,'data-id="'+i+'"')+'</div>').join(''):'<div class="success-state"><div class="success-icon">'+icon('check')+'</div><h3>当前没有安全申请</h3><p>新的申请会显示在这里。</p></div>');}
function exportCsv(rows,filename){const content='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.addEventListener('click',e=>{
 if(e.target.closest('.skip')){e.preventDefault();document.getElementById('main').focus();return;}
 const target=e.target.closest('[data-action]');if(!target)return;const action=target.dataset.action,id=target.dataset.id;
 if(action==='close'){closeDialog();return;}
 if(action==='menu'){state.mobile=!state.mobile;document.querySelector('.sidebar').classList.toggle('mobile-open',state.mobile);document.querySelector('.menu-toggle').setAttribute('aria-expanded',String(state.mobile));return;}
 if(action==='theme'){state.theme=!state.theme;document.body.classList.toggle('theme-dark',state.theme);return;}
 if(action==='search'){openSearch();return;}
 if(action==='search-go'){closeDialog();go(id);return;}
 if(action==='notifications'){openDialog('通知',timeline(events.slice(0,3)),btn('关闭','close')+btn('全部活动','modal-activity','arrow',true));return;}
 if(action==='go-activity'){go('activity');return;}
 if(action==='modal-activity'){closeDialog();go('activity');return;}
 if(action==='offline'){go('devices?view=offline');return;}
 if(action==='sort'){state.sort=!state.sort;refreshDevices();return;}
 if(action==='clear-selection'){state.selected.clear();refreshDevices();return;}
 if(action==='detail-tab'){state.detailTab=id;shell();return;}
 if(action==='policy-tab'){state.policyTab=id;shell();return;}
 if(action==='deploy'||action==='deploy-app'||action==='bulk-policy'){startWizard(Number(id)||0,action==='bulk-policy'?'selected':'all');return;}
 if(action==='remediate'){const d=devices.find(x=>x.id===routeParams.get('id'))||devices[0];startWizard(5,'device',d.issue==='系统更新待安装'?'安装组织批准的系统更新':'启用设备磁盘加密');return;}
 if(action==='wizard-next'){if(state.wizard.step===1&&!state.wizard.name.trim()){document.getElementById('deploy-name').focus();toast('请填写部署名称');return;}state.wizard.step++;renderWizard();return;}
 if(action==='wizard-back'){state.wizard.step--;renderWizard();return;}
 if(action==='wizard-submit'){submitWizard();return;}
 if(action==='created-policy'){closeDialog();state.policyTab='all';go('policies');return;}
 if(action==='policy-detail'){policyDetail(id);return;}
 if(action==='sync-device'||action==='bulk-sync'){const count=action==='sync-device'?1:state.selected.size;record('请求更新 '+count+' 台设备的资产信息','请求已受理，等待设备上报；现有资产状态保持不变','refresh');toast('已创建更新请求，等待设备上报（演示）');return;}
 if(action==='export'){exportCsv([['设备名称','用户','部门','操作系统','状态'],...deviceRows().map(d=>[d.name,d.owner,d.dept,d.os,d.status])],'rss-devices-design.csv');toast('已导出当前筛选的示例设备');return;}
 if(action==='export-activity'){exportCsv([['时间 UTC','活动','说明'],...events.map(x=>[x.time,x.title,x.detail])],'rss-activity-design.csv');return;}
 if(action==='securityRequests'){securityRequestsDialog();return;}
 if(action==='review-approval'){const a=securityRequests[Number(id)];openDialog('审核申请','<h3>'+a.name+'</h3><p class="subtitle">'+a.detail+'</p><div class="selection-summary"><div class="summary-line"><span>申请人</span><span>'+a.owner+'</span></div><div class="summary-line"><span>审批结果</span><span>批准后进入对应业务流程</span></div></div><p class="wizard-note">'+icon('help')+'当前操作仅演示审批，不会授予真实权限或发布软件。</p>',btn('返回列表','securityRequests')+btn('批准申请','approve','check',true,'data-id="'+id+'"'));return;}
 if(action==='approve'){const a=securityRequests.splice(Number(id),1)[0];record('已批准：'+a.name,'审批完成 · 后续执行尚未开始','check');securityRequestsDialog();shell();toast('申请已批准（演示），后续执行单独跟踪');return;}
 if(action==='review-encryption'){openDialog('磁盘加密未启用','<div class="row">'+badge('高优先级','bad')+'<span class="muted tiny">影响 12 台 Mac</span></div><div class="selection-summary"><div class="summary-line"><span>检测依据</span><span>设备最新 FileVault 状态</span></div><div class="summary-line"><span>期望状态</span><span>加密已启用，恢复密钥已托管</span></div><div class="summary-line"><span>建议动作</span><span>分配磁盘加密策略并等待独立复评</span></div></div><h3>示例受影响设备</h3><a class="command-item" href="#device?id=mbp-001" data-action="close">'+icon('laptop')+'Chen 的 MacBook Pro<small>陈一鸣 · 产品设计</small></a>',btn('关闭','close')+btn('查看受影响设备','encryption-devices','arrow',true));return;}
 if(action==='encryption-devices'){closeDialog();go('devices?view=encryption');return;}
 if(action==='windows-risk'){go('devices?view=windows-risk');return;}
 if(action==='mac-risk'){go('device?id=mbp-004');return;}
 if(action==='baselines'){openDialog('组织安全基线','<div class="checklist">'+['macOS 安全基线 · 修订 8','Windows 安全基线 · 修订 5'].map(x=>'<div class="check-row"><strong>'+x+'</strong>'+badge('已启用','good')+'</div>').join('')+'</div><div class="selection-summary"><p class="subtitle">磁盘加密 · 防火墙 · 系统版本 · 完整性保护</p><p class="subtitle">基线持续评估；整改完成后以设备新上报结果确认恢复。</p></div>');return;}
 if(action==='sources'){openDialog('组织软件来源',software.map(a=>'<div class="check-row"><span>'+a.name+'<small class="device-model">'+a.source+'</small></span>'+badge('来源已校验','good')+'</div>').join(''));return;}
 if(action==='enroll'){go('enrollment');return;}
 if(action==='invite'){openDialog('创建注册邀请','<p class="subtitle">为企业设备生成一次注册指引。</p><label class="field">设备使用者<input id="invite-person" placeholder="例如：林晓" maxlength="40"></label><label class="field">设备平台<select id="invite-platform"><option>macOS</option><option>Windows</option></select></label><p class="wizard-note">'+icon('help')+'演示邀请不会发送邮件，也不会生成真实注册凭据。</p>',btn('取消','close')+btn('生成注册指引','create-invite','arrow',true));return;}
 if(action==='create-invite'){const name=document.getElementById('invite-person').value.trim();if(!name){toast('请填写设备使用者');return;}const platform=document.getElementById('invite-platform').value;record('已为 '+name+' 准备注册指引',platform+' 企业设备 · 等待注册','laptop');openDialog('注册指引已准备','<div class="success-state"><div class="success-icon">'+icon('laptop')+'</div><h3>'+esc(name)+' · '+platform+'</h3><p>1. 使用组织账户登录<br>2. 下载并安装组织设备配置<br>3. 等待初始化策略完成</p><span class="badge">设计预览 · 未创建真实注册邀请</span></div>',btn('完成','close'));return;}
});
document.addEventListener('input',e=>{
 if(e.target.id==='device-search'){state.query=e.target.value;refreshDevices();}
 if(e.target.id==='software-search'){state.softwareQuery=e.target.value;document.getElementById('software-results').innerHTML=softwareCards();}
 if(e.target.id==='command-search')document.getElementById('command-results').innerHTML=searchResults(e.target.value);
 if(e.target.id==='deploy-name'&&state.wizard)state.wizard.name=e.target.value;
});
document.addEventListener('change',e=>{
 if(e.target.id==='platform-filter'){state.platform=e.target.value;refreshDevices();}
 if(e.target.id==='status-filter'){state.status=e.target.value;refreshDevices();}
 if(e.target.dataset.select){e.target.checked?state.selected.add(e.target.dataset.select):state.selected.delete(e.target.dataset.select);refreshDevices();}
 if(e.target.id==='select-all'){deviceRows().forEach(d=>e.target.checked?state.selected.add(d.id):state.selected.delete(d.id));refreshDevices();}
 if(e.target.id==='deploy-app'){state.wizard.app=Number(e.target.value);state.wizard.name=software[state.wizard.app].name+' 部署';renderWizard();}
 if(e.target.name==='deploy-scope')state.wizard.scope=e.target.value;
 if(e.target.name==='deploy-timing')state.wizard.timing=e.target.value;
});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(dialog.open)closeDialog();else openSearch();}});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
dialog.addEventListener('cancel',()=>{state.wizard=null;});
window.addEventListener('hashchange',navigate);
navigate();


// ============================================================
// Warframe 裂罅计算器 - 数据源
// 从主 HTML 中提取，便于维护
// ============================================================

// 词条类型
const statOptions = [
    {label:"基础伤害",value:"base"},
    {label:"射速/攻击速度",value:"fireRate"},
    {label:"多重射击",value:"mult"},
    {label:"暴击几率",value:"critRate"},
    {label:"暴击伤害",value:"critDmg"},
    {label:"冲击伤害",value:"impact"},
    {label:"穿刺伤害",value:"puncture"},
    {label:"切割伤害",value:"slash"},
    {label:"冰冻伤害",value:"cold"},
    {label:"火焰伤害",value:"heat"},
    {label:"电击伤害",value:"electric"},
    {label:"毒素伤害",value:"toxin"},
    {label:"触发几率",value:"statusChance"},
    {label:"弹药最大值",value:"magCap"},
    {label:"弹匣容量",value:"magSize"},
    {label:"装填速度",value:"reload"},
    {label:"变焦",value:"zoom"},
    {label:"投射物飞行速度",value:"projSpeed"},
    {label:"穿透",value:"pen"},
    {label:"对Grineer伤害",value:"grineerDmg"},
    {label:"对Corpus伤害",value:"corpusDmg"},
    {label:"对Infested伤害",value:"infestedDmg"},
    {label:"连击持续时间",value:"comboDur"},
    {label:"初始连击",value:"initCombo"},
    {label:"重击效率",value:"heavyEff"},
    {label:"范围",value:"range"},
    {label:"处决伤害",value:"finisher"},
    {label:"滑攻暴击几率",value:"slideCrit"}
];

// 武器类型
const weaponOptions = [
    {label:"步枪",value:"rifle"},
    {label:"霰弹枪",value:"shotgun"},
    {label:"手枪",value:"pistol"},
    {label:"近战",value:"melee"},
    {label:"Archwing枪械",value:"arch"}
];

// 属性组合修正系数（2+0 格式）
const propOptions = [
    {label:"2+0",value:"0.99", negValue:0},
    {label:"2+1",value:"1.2375", negValue:-0.495},
    {label:"3+0",value:"0.75", negValue:0},
    {label:"3+1",value:"0.9375", negValue:-0.75},
    {label:"自定义数值",value:"custom", negValue:"custom"}
];

// 裂罅等级
const riftLvOptions = [
    {label:"Lv.<b>1</b> 0.55 ~ 0.798",value:"1"},
    {label:"Lv.<b>2</b> 0.702 ~ 0.948",value:"2"},
    {label:"Lv.<b>3</b> 0.852 ~ 1.098",value:"3"},
    {label:"Lv.<b>4</b> 1.002 ~ 1.248",value:"4"},
    {label:"Lv.<b>5</b> 1.179 ~ 1.550",value:"5"}
];

// 基础数值表 [词条][武器]
const baseTable = {
    base:         {rifle:165,    shotgun:164.7, pistol:219.6, melee:164.7, arch:99.9},
    fireRate:     {rifle:60.03,  shotgun:89.1,  pistol:74.7,  melee:54.9,  arch:60.03},
    mult:         {rifle:90,     shotgun:119.7, pistol:119.7, melee:0,     arch:60.3},
    critRate:     {rifle:149.99, shotgun:90,    pistol:149.99,melee:180,   arch:99.9},
    critDmg:      {rifle:120,    shotgun:90,    pistol:90,    melee:90,    arch:80.1},
    impact:       {rifle:119.97, shotgun:119.97,pistol:119.97,melee:119.7, arch:90},
    puncture:     {rifle:119.97, shotgun:119.97,pistol:119.97,melee:119.7, arch:90},
    slash:        {rifle:119.97, shotgun:119.97,pistol:119.97,melee:119.7, arch:90},
    cold:         {rifle:90,     shotgun:90,    pistol:90,    melee:90,    arch:119.7},
    heat:         {rifle:90,     shotgun:90,    pistol:90,    melee:90,    arch:119.7},
    electric:     {rifle:90,     shotgun:90,    pistol:90,    melee:90,    arch:119.7},
    toxin:        {rifle:90,     shotgun:90,    pistol:90,    melee:90,    arch:119.7},
    statusChance: {rifle:90,     shotgun:90,    pistol:90,    melee:90,    arch:60.3},
    magCap:       {rifle:49.95,  shotgun:90,    pistol:90,    melee:0,     arch:99.9},
    magSize:      {rifle:50,     shotgun:50,    pistol:50,    melee:0,     arch:60.3},
    reload:       {rifle:50,     shotgun:49.45, pistol:50,    melee:0,     arch:99.9},
    zoom:         {rifle:59.99,  shotgun:0,     pistol:80.1,  melee:0,     arch:59.99},
    projSpeed:    {rifle:90,     shotgun:89.1,  pistol:90,    melee:0,     arch:0},
    pen:          {rifle:2.7,    shotgun:2.7,   pistol:2.7,   melee:0,     arch:2.7},
    grineerDmg:   {rifle:45,     shotgun:45,    pistol:44.55, melee:45,    arch:45},
    corpusDmg:    {rifle:45,     shotgun:45,    pistol:45,    melee:45,    arch:45},
    infestedDmg:  {rifle:45,     shotgun:45,    pistol:45,    melee:45,    arch:45},
    comboDur:     {rifle:0,      shotgun:0,     pistol:0,     melee:8.1,   arch:0},
    initCombo:    {rifle:0,      shotgun:0,     pistol:0,     melee:24.5,  arch:0},
    heavyEff:     {rifle:0,      shotgun:0,     pistol:0,     melee:73.44, arch:0},
    range:        {rifle:0,      shotgun:0,     pistol:0,     melee:1.94,  arch:0},
    finisher:     {rifle:0,      shotgun:0,     pistol:0,     melee:119.7, arch:0},
    slideCrit:    {rifle:0,      shotgun:0,     pistol:0,     melee:120,   arch:0}
};

// 裂罅等级区间
const riftLevelList = [
    {lv:1, min:0.55,  max:0.798},
    {lv:2, min:0.702, max:0.948},
    {lv:3, min:0.852, max:1.098},
    {lv:4, min:1.002, max:1.248},
    {lv:5, min:1.179, max:1.550}
];

// 数值边界常量
const floatMin = 0.9;
const floatMax = 1.1;
const riftCoefMin = 0.1;
const riftCoefMax = 2.0;
const customPropMin = 0.0001;

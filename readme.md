---

# koishi-plugin-p-setu

[![npm](https://img.shields.io/npm/v/koishi-plugin-p-setu?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-p-setu) [![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](http://choosealicense.com/licenses/mit/) ![Language](https://img.shields.io/badge/language-TypeScript-brightgreen) ![Static Badge](https://img.shields.io/badge/QQ交流群-2167028216-green)

东方风图片获取插件，集成智能防屏蔽与P点经济系统，建议配合 [p-qiandao](https://github.com/username/p-qiandao) 使用

---

## 功能特性

- **智能防屏蔽**：通过添加随机彩色边框规避平台审查
- **R18分级控制**：支持纯净模式/混合模式/全年龄模式
- **经济系统**：消耗P点获取图片，支持管理员退款
- **标签搜索**：精准匹配Pixiv作品标签（暂支持单标签）
- **安全审计**：自动拦截敏感关键词请求

---

## 安装指南

```bash
# 通过 npm 安装
npm install koishi-plugin-p-setu
```

```yaml
# koishi.yml 配置示例
plugins:
  p-setu:
    adminUsers:
      - '123456789'        # 管理员用户ID
    price: 500             # 单次请求消耗P点
    punishment: 250        # 违规退款惩罚值
    blockingWord:          # 屏蔽关键词列表
      - '血腥'
      - '暴力'
    enableTags: true       # 显示作品标签
```

---

## 指令说明

### 获取图片 `p-setu`
- **别名**：涩图、色图
- **参数**：
  - `[tag:string]`：Pixiv标签（支持中文/日文/英文）
- **选项**：
  - `-r <mode:string>`：R18模式（f=关闭/t=开启/m=混合）
- **示例**：
  ```bash
  涩图 女仆
  > [系统] 作品名：メイドさんの休日
  > 标签：女仆、制服、萌
  > 作者：藤原書記 | PID：884866

  > @灵梦 扣除500P点，余额：4500
  > [图片]
  ```
  ```bash
  涩图 -r m
  > [系统] R18混合模式已激活
  ```

### 退款操作 `p-return`
- **别名**：退款、姐姐，图没啦！
- **参数**：
  - `[target]`：@用户 或 QQ号（默认最近请求者）
- **权限**：
  - 管理员：全额退还P点
  - 普通用户：扣除 250P点（余额不足则清零）
- **示例**：
  ```bash
  退款 @魔理沙
  > [系统] 已退还500P点给魔理沙
  > 当前余额：魔理沙 5200P | 灵梦 4500P
  ```
  ```bash
  退款
  > [系统] 违规操作！扣除250P点
  > 灵梦 当前余额：4250P
  ```

---

## 核心机制

### 防屏蔽系统
1. 使用 `sharp` 库为图片添加 1px 随机彩色边框
2. 通过 `puppeteer` 渲染实现像素级扰动
3. 动态调整边框颜色避免重复特征

```ts
// 随机颜色生成逻辑
const getRandomColorValue = () => Math.floor(Math.random() * 256)
const borderColor = {
  r: getRandomColorValue(),
  g: getRandomColorValue(),
  b: getRandomColorValue()
}
```

### R18分级控制
| 模式 | 值 | 说明 |
|------|----|------|
| 全年龄 | 0 | 仅返回安全内容 |
| 混合模式 | 2 | 随机返回安全/R18内容 |
| R18模式 | 1 | 仅返回R18内容 |

---

## 配置参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `price` | number | 500 | 单次请求消耗P点 |
| `punishment` | number | 250 | 非管理员退款惩罚值 |
| `blockingWord` | string[] | [] | 屏蔽标签黑名单 |
| `enableTags` | boolean | true | 显示作品标签信息 |

---

## 注意事项

1. **敏感内容管理**：
   - 请勿在非R18频道开启混合/R18模式
   - 屏蔽词列表需定期更新维护

2. **经济平衡**：
   - 推荐 `price` 值为签到日均收益的 30-50%
   - 惩罚值应大于基础收益防止滥用

3. **平台兼容**：
   - 彩色边框对PNG格式支持最佳
   - 部分平台可能压缩图片导致边框失效

---

## 问题反馈
如有问题请提交 Issue 至 [GitHub仓库](https://github.com/gfjdh/koishi-plugin-p-setu)

---

> "就算是涩图也要保持优雅呢~" —— 十六夜咲夜

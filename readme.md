# koishi-plugin-p-setu

[![npm](https://img.shields.io/npm/v/koishi-plugin-p-setu?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-p-setu) [![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](http://choosealicense.com/licenses/mit/) ![Language](https://img.shields.io/badge/language-TypeScript-brightgreen) ![Static Badge](https://img.shields.io/badge/QQ交流群-2167028216-green)

东方风图片获取插件，集成智能防屏蔽与P点经济系统，建议配合 [p-qiandao](https://github.com/username/p-qiandao) 使用

---

## 功能特性

- **智能防屏蔽**：基于 Puppeteer 的像素级扰动与 Sharp 随机彩色边框双重防屏蔽机制
- **多功能搜索**：支持**多标签组合**搜索、指定**画师UID**搜索
- **AI作品控制**：支持**排除AI**、**仅搜索AI**或**混合模式**，内置客户端二次拦截检测与自动退款机制
- **R18分级控制**：全新白名单机制，支持纯净模式/混合模式/R18模式的安全隔离
- **经济系统**：消耗P点获取图片，支持管理员退款
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
    enableTags: true       # 显示作品标签及AI状态
    r18Whitelist:          # R18模式白名单群聊ID
      - '111111111'
    mixWhitelist:          # 混合模式白名单群聊ID
      - '222222222'
    allowPrivateR18: false # 是否允许私聊搜索R18
    deleteCache: true      # 是否自动删除缓存图片
    deleteCacheDelay: 60   # 延迟删除时间(秒)
```

---

## 指令说明

### 获取图片 `p-setu`

* **别名**：涩图、色图
* **参数**：
  * `[tag...]`：Pixiv标签，支持多个标签组合（使用空格分隔）

* **选项**：
  * `-r` / `--r18`：**开启R18模式** (需在对应白名单群聊或允许私聊中)
  * `-e` / `--exai`：**排除AI作品** (excludeAI=true)
  * `-a` / `--ai`：**搜索AI作品** (excludeAI=false)
  * `-u <uid:string>` / `--uid <uid:string>`：指定画师UID
  * *(注：若不加 -e 或 -a，则默认混合搜索)*

* **示例**：
```bash
# 基础多标签搜索 (混合AI与非AI)
涩图 白丝 猫耳
> 作品名：猫耳メイド
> 标签：白丝、猫耳、女仆
> AI作品：否
> [图片]
```

```bash
# 排除AI作品（开启二次拦截保护）
涩图 -e 碧蓝档案
> (搜索碧蓝档案标签，且强制排除AI生成的图片)
> [图片]
```

```bash
# 仅搜索AI作品
涩图 -a 
> (仅搜索AI生成的图片)
> [图片]
```

```bash
# 指定画师UID（可配合标签和排除AI）
涩图 -u 123456 -e
> 作品名：xxxx (来自画师UID:123456，非AI)
> [图片]
```

### 退款操作 `p-return`

* **别名**：退款、姐姐，图没啦！
* **参数**：
  * `[target]`：@用户 或 QQ号（默认最近请求者）

* **权限**：
  * 管理员：全额退还P点
  * 普通用户：扣除 250P点（余额不足则清零）

* **示例**：
```bash
退款 @魔理沙
> 已退还500P点给魔理沙
> 当前余额：魔理沙 5200P | 灵梦 4500P
```

```bash
退款
> 违规操作！扣除250P点
> 灵梦 当前余额：4250P
```

---

## 核心机制

### 1. 搜索与过滤逻辑
* **多标签逻辑**：使用 `Lolicon API V2`，多标签为“与”逻辑（即结果需包含所有指定标签）。
* **AI作品拦截与自动退款**：
  * **默认情况**：未指定参数时，混合搜索AI和非AI作品。
  * **排除模式 (`-e`)**：请求 API 时添加排除参数。若 API 依然返回了 AI 图，插件会进行**二次拦截**，并**自动退回P点**，提示文本可在本地化自定义。
  * **仅AI模式 (`-a`)**：请求 API 时添加允许参数。若 API 返回了非 AI 图，插件会进行**二次拦截**，并**自动退回P点**，提示文本可在本地化自定义。

### 2. 智能防屏蔽系统
* **Puppeteer 像素级扰动**：优先使用 Puppeteer 在 Canvas 上对图片像素进行微小的随机噪点处理，生成独一无二的图片指纹，极大地降低被平台风控拦截的概率。
* **Sharp 随机边框**：若 Puppeteer 环境不可用或渲染失败，自动降级使用 Sharp 为图片添加随机颜色的边框，确保防屏蔽机制的可靠性。

### 3. R18 分级控制 (白名单机制)
* 废弃了旧版的指令动态切换，采用更安全的配置项白名单。
* **纯净模式**：默认状态，仅允许获取非 R18 图片。
* **混合模式**：在 `mixWhitelist` 中的群聊，允许获取 R18 和非 R18 图片。
* **R18 模式**：在 `r18Whitelist` 中的群聊，允许使用 `-r` 参数强制获取 R18 图片。
* **私聊控制**：通过 `allowPrivateR18` 配置项独立控制私聊是否允许 R18。

---

## 注意事项

1. **API 限制**：默认使用 Lolicon API，请遵守其使用规范。
2. **存储空间**：插件会将图片缓存到本地临时目录，请确保磁盘空间充足。可通过配置项开启自动清理。
3. **防屏蔽机制**：Puppeteer 像素级扰动和 Sharp 随机边框功能会稍微增加图片处理时间，但能有效降低被风控的概率。请确保已正确安装相关依赖。

---

## 问题反馈

如有问题请提交 Issue 至 [GitHub仓库](https://github.com/gfjdh/koishi-plugin-p-setu)

---

> "就算是涩图也要保持优雅呢~" —— 十六夜咲夜

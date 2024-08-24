# koishi-plugin-p-setu

[![npm](https://img.shields.io/npm/v/koishi-plugin-p-setu?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-p-setu)

适用于配合p-qiandao使用的涩图插件

- **指令：p-setu [tag]**\n
    别名：涩图，色图\n
    目前只能用一个tag，未来会更新多tag
- **指令：p-return [target]**\n
    别名：退款\n
    给上一个或指定的用户退款（例如图没发出来）需要管理员权限\n
- **为什么需要puppeteer:**\n
    原装的涩图总是被tx吞，经过一次渲染后加了1px的白边，妈妈再也不怕我的图发不出来啦

-
1.0.3更新：随机彩色边框避免多人重复使用时纯白边框被吞

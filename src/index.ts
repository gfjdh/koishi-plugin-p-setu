const { Schema, h } = require('koishi');
const sharp = require('sharp');
const fs = require('fs/promises');
const { existsSync, mkdirSync } = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

exports.name = 'p-setu';

exports.inject = ['database', 'puppeteer'];

exports.usage = `
- **指令：p-setu [tag...]**

    别名：涩图，色图
    
    支持多个标签，请使用空格分隔。例如：\`涩图 猫耳 女仆\`
    
    参数：
    
    -e, --exai   排除AI作品 (excludeAI=true)
    
    -a, --ai     搜索AI作品 (excludeAI=false)
    
    -u, --uid    指定画师UID
    
    -r           请求R18涩图 (需要群聊在白名单内)
    
    *不加 -e 或 -a 时，默认同时搜索AI和非AI作品*

- **指令：p-return [target]**

    别名：退款
    
    给上一个或指定的用户退款（例如图没发出来）需要管理员权限
`;

exports.Config = Schema.object({
  adminUsers: Schema.array(Schema.string()).description('管理员用户ID列表'),
  enableTags: Schema.boolean().default(true).description('是否在发送图片时附带详细Tag信息'),
  blockingWord: Schema.array(Schema.string()).description('屏蔽词列表（包含这些词的请求将被拒绝）'),
  price: Schema.number().default(500).description('一张涩图的价格（P点）'),
  punishment: Schema.number().default(250).description('冒充管理员退款的惩罚扣除点数'),
  outputLogs: Schema.boolean().default(true).description('是否在控制台输出详细日志'),
  r18Whitelist: Schema.array(Schema.string()).default([]).description('R18模式白名单群聊ID'),
  mixWhitelist: Schema.array(Schema.string()).default([]).description('混合模式白名单群聊ID'),
  allowPrivateR18: Schema.boolean().default(false).description('是否允许在私聊中搜索R18图片（开启后私聊等同于混合白名单）'),
  deleteCache: Schema.boolean().default(true).description('是否在发送后自动删除缓存图片（缓存图片仅用作留存，不复用）'),
  deleteCacheDelay: Schema.number().default(60).description('发送后延迟多少秒删除缓存图片')
});

exports.apply = async function apply(ctx, cfg) {
  ctx.model.extend('p_system', {
    id: 'unsigned',
    userid: 'string',
    p: 'integer'
  }, { autoInc: true });

  ctx.model.extend('p_setu', {
    id: 'unsigned',
    channelid: 'string',
    r18: 'integer',
    src: 'string',
    stage: 'string',
    same_user_time: 'integer'
  }, { autoInc: true });

  const logger = ctx.logger('p-setu');

  const tempDir = path.join(__dirname, 'temp');
  if (!existsSync(tempDir)) {
    try {
      mkdirSync(tempDir, { recursive: true });
    } catch (e) {
      logger.warn('无法创建缓存目录，请检查文件夹权限');
    }
  }

  ctx.i18n.define('zh-CN', {
    commands: {
      "p-setu": {
        description: "获取一张涩图，支持多个标签（空格分隔）",
        messages: {
          "account-notExists": "君现在还没有p点，请先签到哦",
          "no-enough-p1": "那个......",
          "no-enough-p2": "君的p点不够力...先签到再来吧qwq",
          "please-wait": "稍等哦...上一个图片还没处理完",
          "blocked-tag": "不可以看包含 {0} 的涩图！",
          "r18-disabled": "当前群聊未开启R18权限，请联系管理员添加白名单。",
          "r18-disabled-private": "当前私聊未开启R18权限，请联系管理员。",
          "no-img-for-tag": "没有你要的标签 [{0}] 呢，可能是xp太怪了吧...",
          "img-not-valid": "哎呀，找不到这张图了...P点已自动退回~",
          "ai-filter-blocked": "哎呀，带这些标签都是AI图呢...P点已自动退回~",
          "ai-only-blocked": "你就这么喜欢AI作品嘛！找不到的说...P点已自动退回~",
          "pay-price": "已扣除{0}p点！现在君还有{1}p点！",
          "img-info": "作品名：{title}\n标签：{tags}\n作者：{author}\nUID：{uid}\nr18：{r18}\nPID：{pid}\nAI作品：{isAI}\n",
          "img-info-no-tags": "作品名：{title}\n作者：{author}\nUID：{uid}\nr18：{r18}\nPID：{pid}\nAI作品：{isAI}\n",
          "send-error": "发送图片时出现了问题，请稍后再试。"
        },
        options: {
          r18: "请求R18涩图",
          exai: "排除AI作品 (excludeAI=true)",
          ai: "搜索AI作品 (excludeAI=false)",
          uid: "指定作者UID"
        }
      },
      "p-return": {
        description: "退款",
        usage: "使用方法：“退款 @对方”，在旧版QQ需要将@元素改为qq号,需要配置管理员",
        messages: {
          "no-id": "退款失败，请尝试将@元素改为qq号！",
          "return-p": "已退款{0}p点！现在<at id={1}/>还有{2}p点！",
          punishment1: "<at id={0}/>冒充恋恋，扣你{1}p点！",
          punishment2: "<at id={0}/>冒充恋恋，扣光你p点！"
        }
      }
    }
  });

  async function isValidImageUrl(url) {
    try {
      if (typeof fetch === "function") {
        const response = await fetch(url, { method: "HEAD" });
        if (response && typeof response.ok === "boolean") return response.ok;
      }
      await ctx.http.get(url, { responseType: "arraybuffer", headers: { Range: "bytes=0-0" } });
      return true;
    } catch (error) {
      return false;
    }
  }

  ctx.command('p/p-setu [...tags]')
    .alias('涩图', '色图', 'setu')
    .option('r18', '-r')
    .option('exai', '-e')
    .option('ai', '-a')
    .option('uid', '-u <uid:string>')
    .action(async ({ session, options }, ...tags) => {
      const USERID = session.userId;
      const CHANNELID = session.channelId;

      const usersdata = await ctx.database.get('p_system', { userid: USERID });
      if (usersdata.length === 0) return session.text('.account-notExists');

      const saving = usersdata[0].p;
      if (saving < cfg.price) {
        await session.sendQueued(h('at', { id: USERID }) + session.text('.no-enough-p1'));
        await session.sendQueued(session.text('.no-enough-p2'));
        return null;
      }

      let targetInfo = await ctx.database.get('p_setu', { channelid: CHANNELID });
      if (targetInfo.length === 0) {
        await ctx.database.create('p_setu', { channelid: CHANNELID, stage: 'over', r18: 0, src: '', same_user_time: 0 });
        if (cfg.outputLogs) logger.success(`${CHANNELID} 初始化完成`);
        targetInfo = [{ id: 0, channelid: CHANNELID, stage: 'over', r18: 0, src: '', same_user_time: 0 }];
      }

      const channelSetu = targetInfo[0];

      if (channelSetu.stage === 'ing') {
        await session.send(String(h('at', { id: USERID })) + session.text('.please-wait'));
        await ctx.sleep(60000);
        await ctx.database.set('p_setu', { channelid: CHANNELID }, { stage: 'over' });
        return null;
      }

      if (tags.length > 0) {
        const blocked = tags.find(t => cfg.blockingWord.includes(t));
        if (blocked) return session.text('.blocked-tag', [blocked]);
      }

      const isPrivate = session.isDirect || !session.guildId;
      let r18_config = 0;

      if (isPrivate) {
        if (cfg.allowPrivateR18) {
          r18_config = 2;
        }
      } else {
        if (cfg.r18Whitelist.includes(CHANNELID)) {
          r18_config = 1;
        } else if (cfg.mixWhitelist.includes(CHANNELID)) {
          r18_config = 2;
        }
      }

      if (options.r18) {
        if (r18_config === 0) {
          return isPrivate ? session.text('.r18-disabled-private') : session.text('.r18-disabled');
        }
        r18_config = 1;
      }

      let url = `https://api.lolicon.app/setu/v2?size=regular&num=5&r18=${r18_config}`;

      if (options.exai) url += '&excludeAI=true';
      else if (options.ai) url += '&excludeAI=false';

      if (tags.length > 0) {
        const tagQuery = tags.map(t => `tag=${encodeURIComponent(t)}`).join('&');
        url += `&${tagQuery}`;
      }

      if (options.uid) {
        url += `&uid=${encodeURIComponent(options.uid)}`;
      }

      if (cfg.outputLogs) logger.info(`请求 API: ${url}`);

      try {
        const JSON_RES = await ctx.http.get(url, { responseType: 'json' });

        if (!JSON_RES.data || JSON_RES.data.length === 0) {
          return session.text('.no-img-for-tag', [tags.join(' & ')]);
        }

        const validImages = JSON_RES.data.filter(img => {
          const aiType = img.aiType || 0;
          if (options.exai && aiType > 0) return false;
          if (options.ai && aiType === 0) return false;
          return true;
        });

        if (validImages.length === 0) {
          if (options.exai) {
            if (cfg.outputLogs) logger.info('API 返回了 AI 图片，已被客户端拦截。');
            return session.text('.ai-filter-blocked');
          }
          if (options.ai) {
            if (cfg.outputLogs) logger.info('API 返回了非 AI 图片（用户仅请求AI），已被客户端拦截。');
            return session.text('.ai-only-blocked');
          }
          return session.text('.no-img-for-tag', [tags.join(' & ')]);
        }

        const selectedImage = validImages[Math.floor(Math.random() * validImages.length)];
        const imageUrl = selectedImage.urls.regular;
        const isValid = await isValidImageUrl(imageUrl);

        await ctx.database.set('p_setu', { channelid: CHANNELID }, { src: USERID });

        const isAI = selectedImage.aiType > 0 ? '是' : '否';
        
        const infoParams = {
          title: selectedImage.title,
          tags: selectedImage.tags ? selectedImage.tags.join(', ') : '',
          author: selectedImage.author,
          uid: selectedImage.uid,
          r18: selectedImage.r18,
          pid: selectedImage.pid,
          isAI: isAI
        };

        const info = cfg.enableTags
          ? session.text('.img-info', infoParams)
          : session.text('.img-info-no-tags', infoParams);

        await session.send(info);

        if (isValid) {
          if (cfg.outputLogs) logger.success('图片已成功获取');
        } else {
          if (cfg.outputLogs) logger.info('图片链接无效');
          return session.text('.img-not-valid');
        }

        await ctx.database.set('p_setu', { channelid: CHANNELID }, { stage: 'ing' });
        const rest = saving - cfg.price;
        await ctx.database.set('p_system', { userid: USERID }, { p: rest });

        const imageBuffer = await ctx.http.get(imageUrl, { responseType: 'arraybuffer' });
        let finalImageBuffer;

        try {
          const pngBase64 = await sharp(imageBuffer).png().toBuffer().then(b => b.toString('base64'));
          const page = await ctx.puppeteer.page();
          
          try {
            const r = Math.floor(Math.random() * 256);
            const g = Math.floor(Math.random() * 256);
            const b = Math.floor(Math.random() * 256);

            await page.setContent(`
              <html>
              <body style="margin: 0; padding: 0; display: inline-block;">
                  <canvas id="canvas"></canvas>
                  <script>
                      const img = new Image();
                      img.src = "data:image/png;base64,${pngBase64}";
                      img.onload = () => {
                          const canvas = document.getElementById('canvas');
                          const ctx = canvas.getContext('2d');
                          canvas.width = img.width + 2;
                          canvas.height = img.height + 2;
                          
                          ctx.fillStyle = 'rgb(${r},${g},${b})';
                          ctx.fillRect(0, 0, canvas.width, canvas.height);
                          
                          ctx.drawImage(img, 1, 1);
                          
                          const imageData = ctx.getImageData(1, 1, img.width, img.height);
                          const data = imageData.data;
                          for (let i = 0; i < data.length; i += 4) {
                              if (Math.random() > 0.8) {
                                  const noise = Math.random() > 0.5 ? 1 : -1;
                                  data[i] = Math.max(0, Math.min(255, data[i] + noise));
                                  data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
                                  data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
                              }
                          }
                          ctx.putImageData(imageData, 1, 1);
                          
                          const div = document.createElement('div');
                          div.id = 'done';
                          document.body.appendChild(div);
                      };
                  </script>
              </body>
              </html>
            `);

            await page.waitForSelector('#done', { timeout: 15000 });
            const body = await page.$('body');
            finalImageBuffer = await body.screenshot({ type: 'png', omitBackground: true });
            if (cfg.outputLogs) logger.success("Puppeteer 像素级扰动渲染成功");

          } finally {
            await page.close();
          }
        } catch (puppeteerError) {
          if (cfg.outputLogs) logger.warn(`Puppeteer 渲染失败，降级使用 sharp 处理: ${puppeteerError}`);
          const getRandomColorValue = () => Math.floor(Math.random() * 256);
          finalImageBuffer = await sharp(imageBuffer).extend({
            top: 1, bottom: 1, left: 1, right: 1,
            background: { r: getRandomColorValue(), g: getRandomColorValue(), b: getRandomColorValue(), alpha: 1 }
          }).png().toBuffer();
        }

        const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.png`;
        const filePath = path.join(tempDir, fileName);
        
        await fs.writeFile(filePath, finalImageBuffer);
        const fileUri = pathToFileURL(filePath).href;

        await session.sendQueued([
          h('at', { id: USERID }),
          session.text('.pay-price', [cfg.price, rest]),
          h('img', { src: fileUri })
        ].join(''));

        if (cfg.outputLogs) logger.success('图片发送成功');

        if (cfg.deleteCache) {
          ctx.setTimeout(async () => {
            try {
              await fs.unlink(filePath);
            } catch (err) {
              if (cfg.outputLogs) logger.warn(`删除临时文件失败: ${fileName}, 错误: ${err}`);
            }
          }, cfg.deleteCacheDelay * 1000);
        }

      } catch (err) {
        logger.error(`处理或发送图片时出错: ${err}`);
        await session.send(session.text('.send-error'));
      } finally {
        await ctx.database.set('p_setu', { channelid: CHANNELID }, { stage: 'over' });
      }
    });

  ctx.command('p/p-return [target]')
    .alias('退款', '姐姐，图没啦！')
    .action(async ({ session }, target) => {
      const USERID = session.userId;
      const CHANNELID = session.channelId;
      
      const channelData = await ctx.database.get('p_setu', { channelid: CHANNELID });
      let targetid = channelData[0]?.src;

      if (target != null) {
        const ats = session.elements.filter((element) => element.type === 'at');
        const match = /\b([1-9]\d{6,})\b/.exec(String(target));
        if (ats.length) {
          targetid = String(ats.map((element) => element.attrs.id));
        } else if (match) {
          targetid = match[1];
        } else {
          return session.text('.no-id');
        }
      }

      if (cfg.outputLogs) logger.success(`${targetid} 申请退款`);
      const targetdata = await ctx.database.get('p_system', { userid: targetid });

      if (cfg.adminUsers.includes(USERID)) {
        const currentP = targetdata[0]?.p || 0;
        await ctx.database.set('p_system', { userid: targetid }, { p: currentP + cfg.price });
        if (cfg.outputLogs) logger.success(`${targetid} 退款成功`);
        return session.text('.return-p', [cfg.price, targetid, currentP + cfg.price]);
      } else {
        const usersdata = await ctx.database.get('p_system', { userid: USERID });
        if (cfg.outputLogs) logger.success(`${targetid} 退款惩罚`);
        const userP = usersdata[0]?.p || 0;
        if (userP >= cfg.punishment) {
          await ctx.database.set('p_system', { userid: USERID }, { p: userP - cfg.punishment });
          return session.text('.punishment1', [USERID, cfg.punishment]);
        } else {
          await ctx.database.set('p_system', { userid: USERID }, { p: 0 });
          return session.text('.punishment2', [USERID]);
        }
      }
    });
};

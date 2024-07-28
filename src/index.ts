import { Context, h, Schema } from 'koishi'
import { } from 'koishi-plugin-puppeteer'
import { JSONPath } from 'jsonpath-plus'
import sharp from 'sharp'

export const usage = `
- **指令：p-setu [tag]**\n
    别名：涩图，色图\n
    目前只能用一个tag，未来会更新多tag
- **指令：p-return [target]**\n
    别名：退款\n
    给上一个或指定的用户退款（例如图没发出来）需要管理员权限\n
- **为什么需要puppeteer:**\n
    原装的涩图总是被tx吞，经过一次渲染后加了1px的白边，妈妈再也不怕我的图发不出来啦`;
export const name = 'setu'

export interface Config {
  adminUsers: string[]
  blockingWword: string[]
  price: number
  punishment: number
  outputLogs: boolean
}

export const inject = {
  required: ['database', 'puppeteer'],
  optional: [],
}

export const Config: Schema<Config> = Schema.object({
  adminUsers: Schema.array(Schema.string()),
  blockingWword: Schema.array(Schema.string()).default(['古明地恋','こいし','古明地こいし','恋恋','恋','koishi']),
  price: Schema.number().default(500),
  punishment: Schema.number().default(250),
  outputLogs: Schema.boolean().default(true),
}).i18n({
  'zh-CN': require('./locales/zh-CN'),
})

async function isValidImageUrl(url: string | URL | Request) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function isTargetIdExists(ctx: Context, USERID: string) {
  //检查数据表中是否有指定id者
  const targetInfo = await ctx.database.get('p_system', { userid: USERID });
  return targetInfo.length == 0;
}
declare module 'koishi' {
  interface Tables { p_system: p_system }
  interface Tables { p_setu: p_setu }
}
export interface p_system {
  id: number
  userid: string
  p: number
}

export interface p_setu {
  id: number
  channelid: string
  r18: number
  src: string
  stage: string
}

export async function apply(ctx: Context, cfg: Config) {
  ctx.model.extend('p_system', {
    id: 'unsigned',
    userid: 'string',
    p: 'integer'
  }, { autoInc: true })

  ctx.model.extend('p_setu', {
    id: 'unsigned',
    channelid: 'string',
    r18: 'integer',
    src: 'string',
    stage: 'string'
  }, { autoInc: true })

  const logger = ctx.logger("p-setu")
  ctx.i18n.define('zh-CN', require('./locales/zh-CN'))

  ctx.command('p/p-setu [tag:string]').alias('涩图','色图')
    .option('r18', '-r <mode:string>')
    .action(async ({ session, options }: any, tag) => {
      const USERID = session.userId;//发送者的用户id
      const CHANNELID = session.channelId;
      const notExists = await isTargetIdExists(ctx, USERID); //该群中的该用户是否签到过
      if (notExists) return session.text('.account-notExists');
      const usersdata = await ctx.database.get('p_system', { userid: USERID });
      const saving = usersdata[0].p;
      if (saving < cfg.price) {
        await session.sendQueued(h('at', { id: USERID }) + session.text('.no-enough-p1'));
        await session.sendQueued(session.text('.no-enough-p2'));
        return null;
      };
      const targetInfo = await ctx.database.get('p_setu', { channelid: CHANNELID }); //该群是否请求过
      if (targetInfo.length == 0) {
        await ctx.database.create('p_setu', { channelid: CHANNELID, stage: 'over', r18: 0 })
        if (cfg.outputLogs) logger.success(CHANNELID + '初始化完成');
      }
      if ((await ctx.database.get('p_setu', { channelid: CHANNELID }))[0]?.stage == 'ing') {
        await session.send(String(h('at', { id: USERID })) + session.text('.please-wait'));
        await ctx.sleep(60000);
        await ctx.database.set('p_setu', { channelid: CHANNELID }, { stage: 'over' });
        return null;
      }
      const r18_config = (await ctx.database.get('p_setu', { channelid: CHANNELID }))[0]?.r18;
      if (cfg.blockingWword.includes(tag)) return session.text('.blocked-tag',[tag]);
      if (options.r18) {
        if (cfg.adminUsers.includes(USERID)) {
          if (options.r18 == 'f') await ctx.database.set('p_setu', { channelid: CHANNELID }, { r18: 0 })
          else if (options.r18 == 't') await ctx.database.set('p_setu', { channelid: CHANNELID }, { r18: 1 })
          else if (options.r18 == 'm') await ctx.database.set('p_setu', { channelid: CHANNELID }, { r18: 2 })
          else return session.text('.r18-wraning');

          if ((await ctx.database.get('p_setu', { channelid: CHANNELID }))[0]?.r18 == 0) return session.text('.r18-off');
          else if ((await ctx.database.get('p_setu', { channelid: CHANNELID }))[0]?.r18 == 1) return session.text('.r18-on');
          else if ((await ctx.database.get('p_setu', { channelid: CHANNELID }))[0]?.r18 == 2) return session.text('.r18-mix');
          else return session.text('.r18-error');
        }
        else return session.text('.r18-no-assignment');
      }

      let url = 'https://api.lolicon.app/setu/v2?size=regular&r18=' + r18_config;
      if (tag != null) url = url + '&tag=' + String(tag);

      if (cfg.outputLogs) logger.info(url);
      const JSON = await ctx.http.get(url, { responseType: "json" });
      const data = JSONPath({ path: "$.data.0", json: JSON });
      if (data.length === 0)
        await session.send(session.text('.no-img-for-tag',[tag]));
      else {
        const imageUrl = await JSONPath({ path: "$.data.0.urls.regular", json: JSON });
        const isValid = await isValidImageUrl(imageUrl);
        await ctx.database.set('p_setu', { channelid: CHANNELID }, { src: USERID })
        await session.send(`\n作品名：${(await JSONPath({ path: "$.data.0.title", json: JSON }))}\n标签：${(await JSONPath({ path: "$.data.0.tags", json: JSON }))}\nr18：${(await JSONPath({ path: "$.data.0.r18", json: JSON }))}\nPID：${(await JSONPath({ path: "$.data.0.pid", json: JSON }))}`);

        if (isValid) {
          if (cfg.outputLogs) logger.success('图片已成功获取');
        } else {
          if (cfg.outputLogs) logger.info('图片链接无效');
          return session.text('.img-not-valid');
        }

        await ctx.database.set('p_setu', { channelid: CHANNELID }, { stage: 'ing' })
        await ctx.database.set('p_system', { userid: USERID }, { p: usersdata[0]?.p - cfg.price })
        const imageBuffer = await ctx.http.get(imageUrl, { responseType: 'arraybuffer' });
        const imageWithBorder = await sharp(imageBuffer)
          .extend({ top: 1, bottom: 1, left: 1, right: 1, background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .toBuffer()
        const imageBase64 = imageWithBorder.toString('base64')
        const image = `data:image/png;base64,${imageBase64}`

        await session.sendQueued([h('at', { id: USERID }),session.text('.get-img-succeed'), h('img', { src: image })].join(''));
        await session.sendQueued(session.text('.pay-price',[cfg.price , usersdata[0]?.p - cfg.price]));
        if (cfg.outputLogs) logger.success('图片发送成功');
        await ctx.database.set('p_setu', { channelid: CHANNELID }, { stage: 'over' })
      }
    });

  ctx.command('p/p-return [target]').alias("退款","姐姐，图没啦！").action(async ({ session },target) => {
    {
      const USERID = session.userId;//发送者的用户id
      const CHANNELID = session.channelId;
      let targetid = (await ctx.database.get('p_setu', { channelid: CHANNELID }))[0]?.src;
      if (target != null) {
        let text = session.elements.filter((element) => element.type == 'at');
        let regex = /\b([1-9]\d{6,})\b/;
        let match = regex.exec(String(target));
        if (!(text.length === 0) || !match) {
          if (!match) return session.text('.no-id');
          targetid = String(text.map(element => element.attrs.id)); // 提取 @ 元素的 id
        }
      }
      if (cfg.outputLogs) logger.success(targetid + '申请退款');
      const targetdata = await ctx.database.get('p_system', { userid: targetid });
      if (cfg.adminUsers.includes(USERID)) {
        await ctx.database.set('p_system', {userid: targetid}, { p: targetdata[0]?.p + cfg.price})
        if (cfg.outputLogs) logger.success(targetid + '退款成功');
        return session.text('.return-p',[cfg.price, targetid, targetdata[0]?.p + cfg.price]);
      } else {
        const usersdata = await ctx.database.get('p_system', { userid: USERID });
        if (cfg.outputLogs) logger.success(targetid + '退款惩罚');
        if (usersdata[0]?.p >= cfg.punishment) {
          await ctx.database.set('p_system', { userid: USERID }, { p: usersdata[0]?.p - cfg.punishment})
          return session.text('.punishment1',[USERID, cfg.punishment]);
        } else {
          await ctx.database.set('p_system', { userid: USERID }, { p: 0})
          return session.text('.punishment2',[USERID]);
        }
      }
    }
  });
}

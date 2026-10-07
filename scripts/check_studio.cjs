// Isolated UI smoke test. All API requests are mocked; never submits real jobs.
const {chromium}=require(process.env.STUDIO_PLAYWRIGHT);
const fs=require('fs');
const path=require('path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>localStorage.setItem('sc_token','studio-test-only'));
 let submitted;
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin==='http://127.0.0.1:5173')return route.continue();
  if(u.pathname==='/auth/me')return route.fulfill({json:{full_name:'Jamie Davis',email:'studio-test@example.com',plan:'pro_500',credits_used:122,credits_limit:350,videos_remaining:228,video_minutes_remaining:500}});
  if(u.pathname==='/youtube/metadata')return route.fulfill({json:{title:'A day of discoveries',thumbnail:'http://127.0.0.1:5173/assets/multi-shorts-source.png',duration:1440,channel:'Sample creator'}});
  if(u.pathname==='/jobs'&&route.request().method()==='POST'){submitted=route.request().postDataJSON();return route.fulfill({json:{job_id:'sample-job',status:'queued'}})}
  if(u.pathname==='/jobs')return route.fulfill({json:{jobs:[]}});
  if(u.pathname==='/social/status')return route.fulfill({json:{youtube:false,tiktok:false}});
  if(u.pathname==='/gameplay/list')return route.fulfill({json:{clips:[]}});
  if(u.pathname==='/tutorial')return route.fulfill({json:{video_url:null}});
  return route.fulfill({json:{}});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{console.log('DIALOG:',d.message());await d.dismiss()});
 const out=path.join(process.env.TEMP,'shortclipr-studio-review');fs.mkdirSync(out,{recursive:true});
 await page.goto('http://127.0.0.1:5173/youtube-shorts/dashboard');await page.getByRole('heading',{name:'Less editing. More creating.'}).waitFor();
 await page.screenshot({path:path.join(out,'overview.png'),fullPage:true});
 await page.getByRole('link',{name:'Create clips',exact:true}).click();
 await page.locator('input').first().fill('https://www.youtube.com/watch?v=1sajFpHn38M');
 console.log('Create buttons',await page.getByRole('button').allTextContents());
 await page.getByRole('button',{name:'Fetch Video →'}).click();
 await page.screenshot({path:path.join(out,'after-fetch.png'),fullPage:true});console.log('After fetch',await page.getByRole('button').allTextContents());
 await page.locator('.ce-caption-style-grid').waitFor();
 await page.getByRole('button',{name:/Last Word/}).click();
 await page.getByRole('button',{name:/Mint \+ Ink/}).click();
 await page.getByRole('button',{name:/Caveat \(Cursive\)/}).click();
 if(await page.getByRole('button',{name:/Archivo Black|Bebas Neue|Poppins|Plus Jakarta/}).count())throw Error('Removed fonts still visible');
 await page.screenshot({path:path.join(out,'create.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(out,'create-mobile.png'),fullPage:true});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile horizontal overflow');
 await page.getByRole('button',{name:'Toggle navigation'}).click();await page.screenshot({path:path.join(out,'navigation-mobile.png')});
 await page.getByRole('button',{name:'Toggle navigation'}).click();
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('.ce-submit-btn').click();await page.waitForURL('**/dashboard');
 if(submitted?.options?.style!=='last_word_box')throw Error('Caption style missing from request: '+JSON.stringify(submitted));
 for(const route of ['clips','settings']){await page.goto('http://127.0.0.1:5173/youtube-shorts/'+route);await page.locator('.studio-topbar').waitFor();await page.screenshot({path:path.join(out,route+'.png'),fullPage:true})}
 await page.goto('http://127.0.0.1:5173/billing');await page.locator('.studio-billing').waitFor();await page.screenshot({path:path.join(out,'billing.png'),fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS; screenshots:',out,'Submitted options:',JSON.stringify(submitted.options));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

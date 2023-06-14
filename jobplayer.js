(function() {
var st_updating = false; //是否正在提交状态
var pauseFlag = false;
var dtd_js = null;
var dtd_cookie = null;
var dtd_adPlayer = null;
var player_size = {};
//进度条拖曳相关
var p_moving = false;
var p_dx = 0;
var p_moved = false;
var test_show = false; //是否正显示课后习题
//图像设置
var image_sets = {brightness:1, contrast:1}; //亮度和对比度默认值都为1
//修复hls拖动卡住
var seekingTimer = null;
//js前缀
var js_prefix = '';
//浏览器判断
var isff = navigator.userAgent.indexOf('Firefox') > -1; //是否firefox
var isie = navigator.userAgent.indexOf('MSIE') > -1; //是否ie
var isie6 = navigator.userAgent.indexOf('MSIE 6') > -1;
var isie8 = navigator.userAgent.indexOf('MSIE 8') > -1;
var is_https = location.protocol == 'https:';

window.Job = {
	player: null,
	container: null,
	adPlayer: null, //片头广告播放器
	options: {
		proxyUrl: '', //跨域代理地址
		useFace: false, //是否采用人脸识别系统
		antiDown: false, //防下载
		swfpath: '', //防下载需要指定
		skipTitle: false, //是否跳过片头
		showAd: false, //是否显示片头广告
		skin: 'video-js', //皮肤
		useMarquee: false, //是否启用跑马灯
		marqueeText: '麦能网',
		useLogo: false, //是否显示Logo
		logoPath: '{dir}logo.png'
	},

	init_player: function(jpcid, options, callback) {
		for (var k in Job.options) {
			if (k in options)
				Job.options[k] = options[k];
		}
		//兼容旧版
		if (Job.proxyUrl) {
			Job.options.proxyUrl = Job.proxyUrl;
		}
		//载入css
		var css_file = Job.options.skin + '.css';
		if (js_prefix.indexOf('playerv2') > -1) { //v2版本
			$('head').append('<link href="'+js_prefix+css_file+'" rel="stylesheet" type="text/css" />');
		}
		dtd_js.done(function(prefix) {
			//人脸识别js加载
			$.when(options.useFace && Job.load_face_scripts(prefix)).done(function() {
				var jpid = jpcid+'_a';
				$('#'+jpcid).html('<video class="video-js vjs-default-skin" controls preload="auto" id="'+jpid+'"></video>');
				var vopts = {};
				if (options.use_flash) vopts.techOrder = ["flash"];
				if (options.width) player_size.width = vopts.width = options.width;
				if (options.height) player_size.height = vopts.height = options.height;
				//ie8 fix: poster
				vopts.poster = prefix+"blank.png";
				videojs(jpid, vopts, function() {
					Job.init(this, options.config);
					if (Job.options.antiDown) $('#'+jpid+'>video').on('contextmenu', function(){return false;});
					callback && callback.call(this);
				});
			});
			//检测是否要安装flash
			if (options.use_flash || !videojs.Html5.isSupported()) {
				var fls = flashChecker();
				if (!fls.f) {
					setTimeout(function check_ready() {
						if ($('#'+jpid+'>.vjs-tech').length) {
							Job.show_flash_install(jpid);
						} else {
							setTimeout(check_ready, 200);
						}
					}, 200);
				}
			}
		});
	},

	setcccookie: function(cc_host) {
		var ifr = $('#ifr_cccookie');
		if (!ifr.length) {
			ifr = $('<iframe id="ifr_cccookie" style="display:none"></iframe>').appendTo('body');
			ifr.load(function() {
				dtd_cookie.resolve();
			});
		}
		ifr.prop('src', cc_host+'/set_cookie.php?referer='+encodeURIComponent(location.href));
	},
	setcacheurl: function() {
		var fileUrl = Job.conf.fileUrls[Job.conf.fileQuality];
		var ifr = $('#ifr_cache');
		if (!ifr.length) {
			ifr = $('<iframe id="ifr_cache" style="display:none"></iframe>').appendTo('body');
		}
		ifr.prop('src', fileUrl);
	},

	init: function(player, configurl) {
		this.player = player;
		this.container = $(player.el());

		this.init_gui();

		//player事件绑定
		//meta
		Job.player.on('loadedmetadata', Job.metaHandler);
		Job.player.on('durationchange', Job.durationHandler);
		//position
		Job.player.on('timeupdate', Job.positionHandler);
		//全屏切换
		Job.player.on('fullscreenchange', Job.fullscreenHandler);
		//播放状态
		Job.player.on('play', Job.playHandler);
		Job.player.on('pause', Job.pauseHandler);
		Job.player.on('ended', Job.stopHandler);
		//拖动
		Job.player.on('seeked', Job.seekHandler);
		Job.player.on('seeking', Job.seekingHandler);
		//单击暂停
		//Job.player.on($.jPlayer.event.click, Job.clickHandler);

		//获取配置
		this.getConfig(configurl).done(function() {
			//人脸识别
			$.when(Job.conf.faceFlag && Job.face.start()).done(function() {
				Job.getXML();

				//事件绑定
				//页面离开时更新
				$(window).on('beforeunload', Job.leaveHandler);

				//titletip
				$('#job_titletip').text(Job.conf.scoTitle);

				//进度条拖曳
				//Job.container.find('.vjs-seek-handle').on('mousedown', Job.slidePbar);
				var seekBar = Job.player.controlBar.progressControl.seekBar;
				seekBar.onMouseMove = Job.movePbar;
				seekBar.onMouseUp = Job.upPbar;

				//进度条提示
				Job.container.find('.vjs-progress-holder').on('mouseenter mousemove', Job.showProgress)
					.mouseleave(Job.hideProgress);
			});
			//清晰度菜单
			Job.hd_init();
			//倍速菜单
			Job.vrate_init();

		}).always(function() {

			//按钮监听
			$('#job_catalog_btn').click(function() {
				if (Job.conf.isShowCatalog) {
					Job.hideCatalog();
				} else {
					Job.showCatalog();
				}
			});
			$('#job_note_btn').click(function() {
				if (Job.conf.isShowNote) {
					Job.hideNote();
				} else {
					Job.showNote();
				}
			});
			$('#job_bug_btn').click(function() {
				if (Job.conf.isShowBug) {
					Job.hideBug();
				} else {
					Job.showBug();
				}
			});
			$('#job_setup_btn').click(function() {
				if (Job.conf.isShowSetup) {
					Job.hideSetup();
				} else {
					Job.showSetup();
				}
			});
			$('#job_subtitle_btn').click(function() {
				if (!Job.conf.subtitleXML) {
					Job.showTip('该视频没有字幕');
					return;
				}
				if (Job.conf.isShowSubtitle) {
					Job.hideSubtitle();
				} else {
					Job.showSubtitle();
				}
			});

			//radio修正
			//$('#job_plugins').on('click', '.radio', function() {
			$('#job_plugins').delegate('.radio', 'click', function() {
				if ($(this).hasClass('gray')) return;
				var radio = $(this).find(':radio');
				radio.prop('checked', true);
				$(this).addClass('on');
				$('#job_plugins :radio[name="'+radio.attr('name')+'"]').each(function() {
					$(this).parent().toggleClass('on', this.checked);
				});
			});
			$('#job_plugins').delegate('.check', 'click', function() {
				if ($(this).hasClass('gray')) return;
				var radio = $(this).find(':checkbox');
				//radio.prop('checked', !radio.prop('checked'));
				$(this).toggleClass('on', radio.prop('checked'));
			});

			//拖曳
			$('#quiz_wnd').drag({handle: $('#quiz_wnd .job-wnd-title')});

		});
	},

	init_gui: function() {
		var html = '<ul id="job_toggles" class="jp-toggles">\
		<li><a href="javascript:;" id="job_catalog_btn" class="job-catalog-btn png_bg" title="目录" hidefocus="hidefocus"></a></li>\
		<li><a href="javascript:;" id="job_note_btn" class="job-note-btn png_bg" title="笔记" hidefocus="hidefocus"></a></li>\
		<li><a href="javascript:;" id="job_bug_btn" class="job-bug-btn png_bg" title="纠错" hidefocus="hidefocus"></a></li>\
		<li><a href="javascript:;" id="job_subtitle_btn" class="job-subtitle-btn png_bg" title="字幕" hidefocus="hidefocus"></a></li>\
		<li><a href="javascript:;" id="job_setup_btn" class="job-setup-btn png_bg" title="设置" hidefocus="hidefocus"></a></li>\
		<li id="job_hd_li" class="job-hd-li"><a href="javascript:;" id="job_hd_btn" class="job-hd-btn png_bg" hidefocus="hidefocus"></a>\
			<ul id="job_hd_list" class="job-hd-list" style="display:none">\
			</ul>\
		</li>\
	</ul>\
	<div id="job_progress_tip" class="job-progress-tip"></div>\
	<div id="job_plugins" class="job-plugins">\
		<!--全屏标题-->\
		<div id="job_titletip" class="job-titletip"></div>\
\
		<!--目录窗口-->\
		<div id="catalog_wnd" class="job-swnd">\
			<a href="javascript:;" class="job-slidein-btn png_bg"></a>\
			<div class="job-swnd-dlg">\
				<div class="job-swnd-title">课程目录</div>\
				<div class="job-swnd-main">\
					<ul id="job_catalist" class="job-catalist">\
					</ul>\
				</div>\
			</div>\
		</div>\
\
		<!--目录窗口-->\
		<div id="note_wnd" class="job-swnd">\
			<a href="javascript:;" class="job-slidein-btn png_bg"></a>\
			<div class="job-swnd-dlg">\
				<div class="job-swnd-title">我的笔记</div>\
				<div class="job-swnd-main">\
					<ul id="job_notelist" class="job-notelist">\
						<li><a href="javascript:;" class="job-note-itm">aaaaaaa</a><a href="javascript:;" class="job-del-btn"></a></li>\
					</ul>\
					<input type="text" id="job_notetxt" class="job-input" value="" />\
					<a id="job_addnote" href="javascript:;" class="job-com-btn">添加笔记</a>\
				</div>\
			</div>\
		</div>\
\
		<!--纠错窗口-->\
		<div id="bug_wnd" class="job-swnd">\
			<a href="javascript:;" class="job-slidein-btn png_bg"></a>\
			<div class="job-swnd-dlg">\
				<div class="job-swnd-title">纠错信息</div>\
				<div class="job-swnd-main">\
					<form id="bug_form">\
						<div class="fitm"><span class="ftxt">错误时间：</span><input type="text" class="job-input" id="job_bug_time" name="bug_time" value="" /></div>\
						<div class="fitm"><span class="ftxt">错误内容：</span><textarea class="job-text" id="job_bug_content" name="bug_content"></textarea></div>\
						<div class="bug_form_cbar">\
							<a id="job_subbug" href="javascript:;" class="job-com-btn">提交</a>\
							<a id="job_viewbug" href="javascript:;" class="job-com-btn">查看课程纠错</a>\
						</div>\
					</form>\
					<div id="bug_history" style="display:none">\
						<div id="job_bugshow" class="job-bugshow">\
						</div>\
						<a id="job_prevbug" href="javascript:;" class="job-com-btn">上一条</a>\
						<a id="job_nextbug" href="javascript:;" class="job-com-btn">下一条</a>\
					</div>\
				</div>\
			</div>\
		</div>\
\
		<!--设置窗口-->\
		<div id="setup_wnd" class="job-swnd">\
			<a href="javascript:;" class="job-slidein-btn png_bg"></a>\
			<div class="job-swnd-dlg">\
				<div class="job-swnd-title">图像增强</div>\
				<div class="job-swnd-main">\
					<div class="enhance_bar">\
						<span class="eb-ico brightness"></span>\
						<div class="scale" id="eb_bar0">\
							<div></div>\
							<span id="eb_btn0"></span>\
						</div>\
						<a href="javascript:;" class="default" id="eb_dbtn0">默认</a>\
					</div>\
					<div class="enhance_bar">\
						<span class="eb-ico contrast"></span>\
						<div class="scale" id="eb_bar1">\
							<div></div>\
							<span id="eb_btn1"></span>\
						</div>\
						<a href="javascript:;" class="default" id="eb_dbtn1">默认</a>\
					</div>\
				</div>\
			</div>\
		</div>\
		<!--<div id="setup_wnd" class="job-swnd">\
			<a href="javascript:;" class="job-slidein-btn png_bg"></a>\
			<div class="job-swnd-dlg">\
				<div class="job-swnd-title">设置</div>\
				<div class="job-swnd-main">\
					<form id="setup_form">\
						<div class="job-qua-cap">视频质量</div>\
						<ul id="job_qualist" class="job-qualist">\
						</ul>\
						<a id="job_setqua" href="javascript:;" class="job-com-btn">确定</a>\
						<a id="job_cancelqua" href="javascript:;" class="job-com-btn">取消</a>\
					</form>\
				</div>\
			</div>\
		</div>-->\
\
		<!--mask层（弹出窗口用）-->\
		<div id="job_mask" class="job-mask"></div>\
\
		<!--测验窗口-->\
		<div id="quiz_wnd" class="job-wnd">\
			<div class="job-wnd-dlg">\
				<div class="job-wnd-title"><span id="quiz_title">课间习题</span><a href="javascript:;" class="job-close-btn png_bg"></a></div>\
				<div class="job-wnd-main">\
					<div id="job_quiz_box" class="job-wnd-mainbox">\
						<div>\
							<form id="job_quiz_form">\
								<ul id="job_quizlist" class="job-quiz-list">\
								</ul>\
							</form>\
						</div>\
						<div class="job-quiz-result">\
							<h2>测试结果</h2>\
							<div id="quiz_resultLabel"></div>\
							<span id="quiz_infoLabel"></span>\
							<div id="quiz_tipLabel"></div>\
						</div>\
						<div>\
							<ul id="job_quizlist2" class="job-quiz-list">\
							</ul>\
						</div>\
					</div>\
					<div class="job-quiz-cbar">\
						<a id="job_quizsub" href="javascript:;" class="job-com-btn">提 交</a>\
						<a id="job_quizskip" href="javascript:;" class="job-com-btn">跳过习题</a>\
						<a id="job_quizview" href="javascript:;" class="job-com-btn" style="display:none">查看答案</a>\
						<a id="job_quizreset" href="javascript:;" class="job-com-btn" style="display:none">重 做</a>\
						<a id="job_quizfinish" href="javascript:;" class="job-com-btn" style="display:none">完 成</a>\
					</div>\
				</div>\
			</div>\
		</div>\
\
		<!--字幕-->\
		<div id="job_subtitle" class="job-btip job-subtitle"></div>\
\
		<!--bugtip-->\
		<div id="job_bugtip" class="job-btip job-bugtip">\
			<span id="job_bugtip_txt"></span>\
			<a href="javascript:;" class="job-tclose-btn"></a>\
		</div>\
\
		<!--errortip-->\
		<div id="job_errortip" class="job-errortip"></div>\
\
		<!--重播-->\
		<div id="job_replay" class="job-replay">\
			<div class="job-replay-lay">\
				<a href="javascript:;" id="job_replay_btn" class="job-replay-btn job-text-btn"><span>重新播放</span></a>\
				<a href="javascript:;" id="job_nextvideo_btn" class="job-nextvideo-btn job-text-btn"><span>下一章节</span></a>\
			</div>\
		</div>\
\
		<div id="job_camdlg" class="job-wnd">\
			<div class="job-wnd-dlg">\
				<div class="job-wnd-title"><span id="face_title">人脸检测登录</span></div>\
				<div class="job-wnd-main">\
					<div class="job_live_cont">\
						<video id="job_live" width="320" height="240" preload autoplay loop muted></video>\
						<canvas id="job_canvas" width="320" height="240"></canvas>\
					</div>\
					<div id="job_facebar">\
						<div id="job_face_info"></div>\
						<!--<a href="javascript:;" id="job_facegather" class="job-com-btn">采集</a>-->\
						<a href="javascript:;" id="job_facelogin" class="job-com-btn">识别</a>\
						<!--<a href="javascript:;" id="job_faceskip" class="job-com-btn">跳过</a>-->\
					</div>\
					<div id="job_face_loading" class="job-loading" style="display:none">正在识别...</div>\
					<canvas id="job_canvas2" width="600" height="450"></canvas>\
				</div>\
			</div>\
		</div>\
\
	</div><!--job-plugins end-->';
		$('body').append(html);
		if (navigator.userAgent.indexOf('MSIE 6') > -1 || navigator.userAgent.indexOf('MSIE 7') > -1) this.container.addClass('video-js vjs-default-skin');
		this.container.find('.vjs-fullscreen-control').after($('#job_toggles'));
		this.container.append($('#job_plugins'));
		this.container.find('.vjs-progress-control').append($('#job_progress_tip'));
		this.container.find('.vjs-time-controls,.vjs-time-divider').wrapAll('<div class="job-bcol job-time"><div class="job-bcolbody"></div></div>').eq(0).parent().before('<b class="lcorner png_bg"/>').after('<b class="rcorner png_bg"/>');
		this.container.find('.vjs-fullscreen-control,#job_toggles,.vjs-volume-control,.vjs-mute-control').wrapAll('<div class="job-bcol job-cbar"><div class="job-bcolbody"></div></div>').eq(0).parent().before('<b class="lcorner png_bg"/>').after('<b class="rcorner png_bg"/>');
		if (Job.options.useMarquee) {
			Job.container.append('<div class="job-marquee-bg"><div id="job_marquee" class="job-marquee"/></div>');
			$('#job_marquee').text(Job.options.marqueeText);
			Job.marquee.init();
			$(window).resize($.proxy(Job.marquee, 'resize'));
		}
		if (Job.options.useLogo) {
			Job.container.append('<div id="job_logo" class="job-logo"><img /></div>');
			var logo = Job.options.logoPath.replace('{dir}', js_prefix);
			$('#job_logo img').prop('src', logo);
			$(window).resize($.proxy(Job, 'resizeLogo'));
		}
		if (isie6) {
			$('.vjs-play-control,.vjs-play-control .vjs-control-content,.vjs-fullscreen-control,.vjs-mute-control,.job-logo').addClass('png_bg');
			DD_belatedPNG.fix('.png_bg');
		}
		if (Job.options.showAd) {
			dtd_adPlayer = $.Deferred();
			var ad_id = this.container.parent().attr('id')+'_t';
			this.container.parent().append('<video class="video-js vjs-default-skin job-tplayer" preload="auto" id="'+ad_id+'"></video>');
			//ios fix
			//if (/\(i[^;]+;( U;)? CPU.+Mac OS X/.test(navigator.userAgent)) {
			if (vjs.IS_IOS) {
				$('body').append('<style tyle="text/css">.job-tplayer.vjs-controls-disabled .vjs-big-play-button {display: block;}\n.job-tplayer.vjs-has-started.vjs-playing .vjs-big-play-button {display: none;}</style>');
			}
			//videojs(ad_id, {width:'100%', height:'100%'}, function() {
			videojs(ad_id, player_size, function() {
				Job.adPlayer = this;
				$(this.el()).hide();
				dtd_adPlayer.resolve();
				this.on('ended', function() {
					Job.conf.dtd_ad_over.resolve();
				});
			});
		}
	},

	show_flash_install: function(jpid) {
		var html = '\
		<!--安装flash提示-->\
		<div id="flash_install" class="job-flash-install">\
			<h3>您尚未安装Flash插件，无法播放视频了</h3>\
			<span>建议您......</span>\
			<div class="btn-lay">\
				<a href="https://get.adobe.com/cn/flashplayer/" target="_blank" class="flash-inst-btn">\
					<span>安装Flash插件</span>\
				</a>\
			</div>\
		</div>';

		$('#'+jpid).append(html);
	},

	loadscripts: function() {
		var scripts = document.getElementsByTagName('script');
		for (var i=0; i<scripts.length; i++) {
			if (scripts[i].src && /^(.*\/)jobplayer\.js/.test(scripts[i].src)) {
				var prefix = js_prefix = RegExp.$1;
				if (prefix.indexOf('playerv2') == -1) { //v1版本
					$('head').append('<link href="'+prefix+'video-js.css" rel="stylesheet" type="text/css" />');
				}
				$.getScript(prefix + 'video.js', function() {
					if (Job.options.antiDown && Job.options.swfpath) {
						videojs.options.flash.swf = Job.options.swfpath;
					} else {
						videojs.options.flash.swf = prefix + "video-js.swf";
					}
					dtd_js.resolve(prefix);
				});
				$.getScript(prefix + 'jquery.drag.js');
				if (isie6) {
					$.getScript(prefix + 'DD_belatedPNG.js');
				}
				break;
			}
		}
	},

	load_face_scripts: function(prefix) {
		/*
		return $.when(
			$.getScript(prefix + 'face/ccv.js'),
			$.getScript(prefix + 'face/face.js'),
			$.getScript(prefix + 'face/jobface.js')
		);
		*/
		return $.when(
			$.getScript(prefix + 'face/tracking-min.js'),
			$.getScript(prefix + 'face/face-min.js'),
			$.getScript(prefix + 'face/jobface-new.js')
		);
	},

	hd_init: function() {
		var labels = [['normal', '标清'], ['high', '高清'], ['mobile', '移动']];
		var html = '';
		$.each(labels, function(i, label) {
			if (!Job.conf.fileUrls[label[0]]) return;
			html += '<li quality="'+label[0]+'"';
			if (label[0] == Job.conf.fileQuality) {
				html += ' class="on"';
				$('#job_hd_btn').text(label[1]);
			}
			html += '><span>'+label[1]+'</span></li>';
		});
		$('#job_hd_list').html(html);
		$('#job_hd_li').hover(function() {
			$('#job_hd_list').show();
		}, function() {
			$('#job_hd_list').hide();
		});
		$('#job_hd_list>li').click(function() {
			var quality = $(this).attr('quality');
			if (quality == Job.conf.fileQuality) return;
			Job.changeQuality(quality);
			$(this).addClass('on').siblings().removeClass('on');
			$('#job_hd_btn').text($(this).text());
			$('#job_hd_list').hide();
		});
	},

	vrate_init: function() {
		if (!Job.conf.enableVideoRate || !Job.conf.finish) return;
		$('#job_hd_li').after('<li id="job_vrate_li" class="job-hd-li"><a href="javascript:;" id="job_vrate_btn" class="job-hd-btn png_bg" hidefocus="hidefocus">1.0X</a>\
			<ul id="job_vrate_list" class="job-hd-list" style="display:none">\
				<li rate="0.5"><span>0.5X</span></li>\
				<li rate="1" class="on"><span>1.0X</span></li>\
				<li rate="1.25"><span>1.25X</span></li>\
				<li rate="1.5"><span>1.5X</span></li>\
				<li rate="2"><span>2.0X</span></li>\
			</ul>\
		</li>')
		$('#job_vrate_li').hover(function() {
			$('#job_vrate_list').show();
		}, function() {
			$('#job_vrate_list').hide();
		});
		$('#job_vrate_list>li').click(function() {
			var rate = Number($(this).attr('rate'));
			if (rate == Job.conf.videoRate) return;
			Job.changeRate(rate);
			$(this).addClass('on').siblings().removeClass('on');
			$('#job_vrate_btn').text($(this).text());
			$('#job_vrate_list').hide();
		});
	},

	getConfig: function(url) {
		Job.conf = new Job.ConfCls();

		var dtd = $.Deferred();
		$.ajax(url, {dataType: 'xml'}).done(function(xml) {
			$(xml.documentElement).children().each(function() {
				if (this.tagName == 'fileUrl') {
					$(this).children().each(function() {
						Job.conf.fileUrls[this.tagName] = $(this).text();
					});
				} else {
					if (this.tagName in Job.conf) {
						var t = typeof Job.conf[this.tagName];
						if (t == 'number')
							Job.conf[this.tagName] = Number($(this).text());
						else if (t == 'boolean')
							Job.conf[this.tagName] = Job.utils.cbool($(this).text());
						else
							Job.conf[this.tagName] = $(this).text();
					}
				}
			});
			Job.conf.startTime = Job.conf.lastViewedTime;

			//跨域修正
			if (Job.options.proxyUrl) {
				$.each(['catalogUrl', 'quizUrl', 'bugUrl', 'subtitleUrl'], function(i, k) {
					var url = Job.conf[k], m;
					if (m = url.match(/https?:\/\/([^\/]+)/)) {
						var host = m[1];
						if (host != location.host) {
							Job.conf[k] = Job.utils.joinUrl(Job.options.proxyUrl, 'url='+encodeURIComponent(url));
						}
					}
				});
			}

			//修正视频文件地址
			//var cc_server = is_https ? 'ccs.mynep.com.cn' : 'cc.mynep.com.cn';
			//$.getJSON('//'+cc_server+'/servid.php?callback=?', function(servid) {
				/*
				for (var k in Job.conf.fileUrls) {
					var video_is_https = Job.conf.fileUrls[k].indexOf('https:') == 0;
					var cc_domain = video_is_https || servid != 'cc1' ? servid+'.mynep.com.cn' : 'cc1.mynep.com.cn:8080';
					Job.conf.fileUrls[k] = Job.conf.fileUrls[k].replace('cc.mynep.com.cn', cc_domain);
					//加上随机数
					if (Job.options.antiDown) {
						Job.conf.fileUrls[k] = Job.utils.joinUrl(Job.conf.fileUrls[k], 't='+(new Date()).getTime());

						//设置cookie
						if (k == Job.conf.fileQuality) {
							dtd_cookie = $.Deferred();
							var cc_host = (video_is_https ? 'https://' : 'http://') + cc_domain;
							Job.setcccookie(cc_host);
							isff && Job.setcacheurl(); //FireFox的cache fix
							//Job.setcacheurl(); //FireFox的cache fix
						}
					}
				}
				*/
				var fileUrl = Job.conf.fileUrls[Job.conf.fileQuality];
				if (fileUrl) {
					var medias = {src: fileUrl};
					if (fileUrl.match(/\.flv$/i)) {
						/*
						alert('HTML5版暂不支持flv视频！');
						dtd.reject();
						*/
						medias.type = 'video/flv';
					/*
					} else if (fileUrl.match(/\.m3u8$/i)) {
						medias.type = 'application/x-mpegURL';
					*/
					} else {
						Job.conf.is_hls = /\.m3u8$/i.test(fileUrl);
						medias.type = 'video/mp4';
					}
					//显示片头广告
					var do_skip = Job.options.skipTitle && Job.conf.title_duration > 0;
					if (Job.options.showAd && Job.conf.adUrl
							&& (!do_skip && !Job.conf.startTime || do_skip && Job.conf.startTime < Job.conf.title_duration)) {
						Job.conf.show_ad = true;
					}
					if (Job.conf.show_ad) {
						dtd_adPlayer.done(function() {
							$(Job.adPlayer.el()).show();
							$('#job_mask').show();
							Job.container.addClass('job-masked');
							Job.adPlayer.src({src: Job.conf.adUrl, type: 'video/mp4'});
							Job.adPlayer.play();
						});
					}
					//跳过片头
					var startTime = 0;
					if (Job.conf.show_ad && do_skip)
						startTime = Job.conf.title_duration;
					if (Job.conf.startTime)
						startTime = Math.max(startTime, Job.conf.startTime);
					if (startTime || Job.conf.autostart) {
						if (!isie) {
							Job.player.one('loadedmetadata', function() {
								if (startTime) Job.player.currentTime(startTime);
								if (Job.conf.autostart) Job.startPlay();
							});
						} else {
							Job.conf.dtd_duration.done(function() {
								if (startTime) Job.player.currentTime(startTime);
								if (Job.conf.autostart) Job.startPlay();
							});
						}
					}
					if (Job.options.useMarquee) {
						if (Job.player.techName == 'Html5' && Job.options.marqueeText) {
							Job.conf.use_marquee = true;
							Job.player.one('loadedmetadata', function() {
								Job.marquee.begin();
							});
						} else {
							Job.conf.use_marquee = false;
							if (Job.player.techName == 'Flash' && Job.options.marqueeText) {
								try {
									Job.player.tech.el().job_setmarqueetext(Job.options.marqueeText);
								} catch (e) {}
							}
						}
					}
					if (Job.options.useLogo) {
						var flash_use_logo = false;
						if (Job.conf.noLogo) {
							Job.conf.use_logo = false;
						} else if (Job.player.techName == 'Html5' && Job.options.logoPath) {
							Job.conf.use_logo = true;
						} else {
							Job.conf.use_logo = false;
							flash_use_logo = true;
						}
						if (Job.player.techName == 'Flash') {
							try {
								Job.player.tech.el().job_setlogoshow(flash_use_logo);
							} catch (e) {}
						}
					}
					/*
					if (Job.options.antiDown) {
						dtd_cookie.done(function() {
							Job.player.src(medias);
						});
					} else {
					*/
						Job.player.src(medias);
					//}
					if (Job.conf.show_ad) Job.container.hide();
					dtd.resolve();
				}
			//});

			//人脸识别
			if (Job.conf.faceFlag) {
				if (!Job.conf.faceUrl || !Job.conf.personId || !Job.options.useFace)
					Job.conf.faceFlag = false;
			}

		}).fail(function() {
			Job.showTip('配置文件加载出错！');
			dtd.reject();
		});
		return dtd.promise();
	},

	getXML: function() {
		$.when(Job.getQuizXml(), Job.getBugXml(), Job.getSubtitleXml()).always(function() {
			if (Job.conf.show_ad) {
				Job.conf.dtd_ad_over.done(function() {
					Job.conf.dtd_canplay.resolve();
					$(Job.adPlayer.el()).hide();
					$('#job_mask').hide();
					Job.container.show().removeClass('job-masked');
				});
			} else {
				Job.conf.dtd_canplay.resolve();				
				/*
				//修复hls不会自动播放
				if (Job.conf.autostart) setTimeout(Job.startPlay, 200);
				*/
			}
		});
	},

	startPlay: function() {
		Job.conf.dtd_canplay.done(function() {
			Job.player.play();
		});
		/*
		if (Job.options.skipTitle && Job.conf.title_duration > Job.conf.startTime)
			Job.showTip('已为您跳过片头');
		*/
	},

	getQuizXml: function() {
		if (!Job.conf.quizUrl) {
			return;
		}
		return $.ajax(Job.conf.quizUrl, {dataType: 'xml'}).done(function(xml) {
			//Job.conf.quizXML = xml;
			Job.conf.set_quizXML(xml);
		});
	},

	getBugXml: function() {
		if (!Job.conf.bugUrl) {
			return;
		}
		return $.ajax(Job.conf.bugUrl, {dataType: 'xml'}).done(function(xml) {
			//Job.conf.bugXML = xml;
			Job.conf.set_bugXML(xml);
		});
	},

	getSubtitleXml: function() {
		if (!Job.conf.subtitleUrl) {
			return;
		}
		//支持两种格式
		if (!/\.(\w+)$/.test(Job.conf.subtitleUrl)) return;
		var ext = RegExp.$1.toLowerCase();
		//xml
		if (ext == 'xml') {
			return $.ajax(Job.conf.subtitleUrl, {dataType: 'xml'}).done(function(xml) {
				Job.conf.subtitleXML = xml;
				Job.conf.subtitleType = 'xml';
				Job.conf.set_subtitle();
			});
		//srt
		} else if (ext == 'srt') {
			return $.ajax(Job.conf.subtitleUrl).done(function(txt) {
				Job.conf.subtitleXML = txt;
				Job.conf.subtitleType = 'srt';
				Job.conf.set_subtitle();
			});
		}
	},

	//事件代理
	on: function() {
		Job.container.on.apply(Job.container, arguments);
	},
	off: function() {
		Job.container.off.apply(Job.container, arguments);
	},
	trigger: function() {
		Job.container.trigger.apply(Job.container, arguments);
	},

	fullscreenHandler: function(e) {
		//if (e.jPlayer.options.fullScreen)
		
		//调整各个窗口位置
		Job.conf.isShowCatalog && Job.resizeWnd($('#catalog_wnd'));
		Job.conf.isShowNote && Job.resizeWnd($('#note_wnd'));
		Job.conf.isShowBug && Job.resizeWnd($('#bug_wnd'));
		Job.conf.isShowSetup && Job.resizeWnd($('#setup_wnd'));
		Job.conf.isShowQuiz && Job.centerWnd($('#quiz_wnd'));

		//跑马灯
		if (Job.conf.use_marquee) {
			Job.marquee.resize();
		}
		//Logo
		if (Job.conf.use_logo) {
			setTimeout(function() {
				Job.resizeLogo();
			}, 30);
		}

		window.fullResize && window.fullResize(e); //IE fullscreen fix
	},

	startUpd: function() {
		if (!Job.conf.updTimer) {
			Job.conf.updStime = (new Date()).getTime();
			Job.conf.updTimer = setInterval(Job.updHandler, 1000);
		}
	},

	stopUpd: function() {
		if (Job.conf.updTimer) {
			clearInterval(Job.conf.updTimer);
			Job.conf.updTimer = null;
			Job.setAddTime();
		}
	},

	setAddTime: function() {
		if (Job.conf.updStime) {
			var stime = (new Date()).getTime();
			var diff_time = Math.min((stime - Job.conf.updStime) / 1000, Job.conf.updInterval+1);
			if (diff_time < 0) diff_time = 0;
			//Job.conf.updAddTime += diff_time * Job.conf.videoRate;
			Job.conf.updAddTime += diff_time;
			Job.conf.updStime = Job.conf.updTimer ? stime : 0;
		}
	},

	fix_ie8gui: function() {
		if (isie8) {
			var play_btn = $('.vjs-play-control');
			play_btn.addClass('content-empty');
			setTimeout(function(){
				play_btn.removeClass('content-empty');
			}, 0);
		}
	},

	playHandler: function() {
		//计时
		Job.startUpd();
		//继续字幕
		Job.resumeSubtitle();
		//隐藏重播画面
		Job.hideReplay();
		Job.fix_ie8gui();
		//跑马灯
		if (Job.conf.use_marquee) {
			Job.marquee.resume();
		}
	},

	pauseHandler: function() {
		//停止计时
		Job.stopUpd();
		if (pauseFlag) {
			pauseFlag = false;
		}
		//暂停字幕
		Job.pauseSubtitle();
		Job.fix_ie8gui();
		//跑马灯
		if (Job.conf.use_marquee) {
			Job.marquee.pause();
		}
	},

	stopHandler: function() {
		if (isie) { //ie bug
			if (Job.player.currentTime() < Job.player.duration() - 1) {
				Job.player.play();
				return;
			}
		}
		//停止计时
		Job.stopUpd();
		if (!Job.conf.viewFlag) {
			//最后再提交一次学习状态
			Job.updateStatus(true);
		}
		//停止字幕
		Job.hideSubtitle();
		//显示重播画画
		if (Job.conf.testIndex == -1) {
			Job.showReplay();
		} else {
			var quizlist = $(Job.conf.quizXML.documentElement).children();
			Job.conf.quizIndex = Job.conf.testIndex;
			var question = quizlist.eq(Job.conf.testIndex);
			Job.showQuiz(question);
			test_show = true;
		}
		//跑马灯
		if (Job.conf.use_marquee) {
			Job.marquee.pause();
			//$('#job_marquee').hide();
		}
	},

	leaveHandler: function() {
		console.log('leave');
		//if (!Job.conf.viewFlag && Job.conf.updTimer) {
		if (!Job.conf.viewFlag && (Job.conf.updTimer || Job.conf.updAddTime)) {
			//最后再提交一次学习状态
			Job.updateStatus();
		}
		return undefined;
	},

	seekHandler: function(e) {
		//修复hls拖动卡住
		if (Job.conf.is_hls) {
			if (seekingTimer) {
				clearTimeout(seekingTimer);
				seekingTimer = null;
			}
		}
		//重载字幕
		Job.reloadSubtitle();
		if (Job.player.paused()) {
			Job.pauseSubtitle();
		}

		//目录窗口时间定位
		if (Job.conf.isShowCatalog) {
			Job.catalogWnd.locate();
		}
		//刷新bugtip
		//Job.refreshBugTip();

		if (!Job.conf.viewFlag) {
			//提交学习状态
			Job.updateStatus();
		}
	},
	seekingHandler: function(e) {
		//修复hls拖动卡住
		if (Job.conf.is_hls) {
			if (seekingTimer) {
				clearTimeout(seekingTimer);
				seekingTimer = null;
			}
			seekingTimer = setTimeout(Job.fixSeek, 1000);
		}
	},
	fixSeek: function() {
		console.log('fix seeking');
		var now = Job.player.currentTime();
		Job.player.currentTime(Math.max(now, 0));
	},

	clickHandler: function(e) {
		if (!Job.player.paused()) {
			Job.player.pause();
		} else {
			Job.player.play();
		}
	},

	metaHandler: function(e) {
		//FireFox cache fix
		/*
		if (Job.options.antiDown) {
			if (isff) {
				try {
					//console.log('reload');
					$('#ifr_cache')[0].contentWindow.location.reload(true);
				} catch (e) {}
			}
		}
		*/
		//跑马灯
		if (Job.conf.use_marquee) {
			$('#job_marquee').show();
		}
		//Logo
		if (Job.conf.use_logo) {
			$('#job_logo').show();
			Job.resizeLogo();
		}
	},

	durationHandler: function(e) {
		//Job.conf.totalTime = Job.player.duration();
		var t_time = Job.player.duration();
		if (t_time) {
			if (!Job.conf.totalTime) Job.conf.set_totalTime(t_time);
			else Job.conf.totalTime = t_time;
		}
	},

	updHandler: function() {
		//状态提交
		if (!Job.conf.viewFlag) {
			//if (Job.conf.updAddTime + (((new Date()).getTime() - Job.conf.updStime) / 1000 * Job.conf.videoRate) >= Job.conf.updInterval) {
			if (Job.conf.updAddTime + (((new Date()).getTime() - Job.conf.updStime) / 1000) >= Job.conf.updInterval) {
				Job.updateStatus();
			}
		}
	},

	positionHandler: function(e) {
		if (!Job.conf.totalTime && Job.player.duration()) {
			Job.conf.set_totalTime(Job.player.duration());  //安卓与flash版的metadata事件中取不到duration
		}
		Job.conf.lastViewedTime = Job.player.currentTime();
		Job.conf.maxViewedTime = Math.max(Job.conf.maxViewedTime, Job.conf.lastViewedTime);

		//测验检测
		Job.checkQuiz();

		//目录窗口定位
		if (Job.conf.isShowCatalog) {
			Job.catalogWnd.locate();
		}
	},

	//暂停（不显示图标）
	pauseSilent: function() {
		pauseFlag = true;
		Job.player.pause();
	},

	checkQuiz: function() {
		//trace("QUIZ...................");
		var currentTime = Math.floor(Job.conf.lastViewedTime);
		if (Job.conf.lastQuizTime == currentTime) return;
		Job.conf.lastQuizTime = currentTime;

		/**检查checkpoint点是否已经查看过*/
		if(!Job.conf.hasCheckOne && currentTime >= Job.conf.cp_one && currentTime < Job.conf.cp_two && ((currentTime - Job.conf.cp_one) <= 1) ){
			console.log("CHECK POINT 1 PASSED!!! "+Job.conf.cp_one+ "秒");
			Job.conf.hasCheckOne = true;
		}
		if(!Job.conf.hasCheckTwo && currentTime >= Job.conf.cp_two && currentTime < Job.conf.cp_three && ((currentTime - Job.conf.cp_two) <= 1) ){
			console.log("CHECK POINT 2 PASSED!!!"+Job.conf.cp_two+ "秒");
			Job.conf.hasCheckTwo = true;
		}
		if(!Job.conf.hasCheckThree && currentTime >= Job.conf.cp_three && ((currentTime - Job.conf.cp_three) <= 1) ){
			console.log("CHECK POINT 3 PASSED!!!"+Job.conf.cp_three+ "秒");
			Job.conf.hasCheckThree = true;
		}
		/**弹出测验窗口，暂停视频播放 */
		if (Job.conf.quizXML) {
			var quizlist = $(Job.conf.quizXML.documentElement).children();
			$.each(Job.conf.quizTimeArray, function(i, t) {
				if(t == currentTime){
					Job.conf.quizIndex = i;
					var question = quizlist.eq(i);
					Job.showQuiz(question);
					return false;
				}
			});
		}

		//检测bugxml
		$.each(Job.conf.bugTimeArray, function(i, t) {
			if(t == currentTime){
				var bug = $(Job.conf.bugXML.documentElement).children().eq(i);
				var time = bug.find('>time').text();
				var content = bug.find('>content').text();
				var bugCont = "视频的" + Job.bugWnd.format_time(time) + "更正：" + content;
				Job.showBugTip(bugCont);
				//clearInterval(_positionInterval);
				Job.conf.bugIndex = i;
				return false;
			}
		});
	},

	showQuiz: function(xml) {
		Job.player.pause();
		Job.conf.quizWin = new Job.QuizWnd(xml);
		Job.popWnd($('#quiz_wnd'));
		Job.conf.isShowQuiz = true;
	},

	closeQuiz: function() {
		Job.removeWnd($('#quiz_wnd'));
		Job.conf.isShowQuiz = false;
		Job.conf.quizFinish = true;
		if (!test_show) {
			Job.player.play();
		} else {
			Job.showReplay();
			test_show = false;
		}
	},

	updateStatus: function(finished) {
		if (st_updating) return;
		//if (!finished && Job.conf.lastViewedTime == 0) return; //时间点为0时不提交
		st_updating = true;
		var obj = {};
		obj.userId = Job.conf.userId;
		obj.courseId = Job.conf.courseId;
		obj.scoId = Job.conf.scoId;
		obj.historyId = Job.conf.historyId;
		//obj.addTime = Job.conf.updInterval;//新增学习时间，单位秒
		Job.setAddTime();
		obj.addTime = Math.floor(Job.conf.updAddTime);//新增学习时间，单位秒
		Job.conf.updAddTime -= obj.addTime;
		obj.totalTime = Job.conf.totalTime;
		if (finished) {
			obj.finished = 1;
			obj.currentTime = 0;
		} else {
			obj.currentTime = Job.conf.lastViewedTime;//当前时间，可用来更新最后一次访问时间，学习到达最远时间点等
		}
		obj.hasCheckOne = Job.conf.hasCheckOne;
		obj.hasCheckTwo = Job.conf.hasCheckTwo;
		obj.hasCheckThree = Job.conf.hasCheckThree;
		obj.firstUpdate = Job.conf.firstUpdate; //第一次提交时，更新，用于统计学习次数
		Job.conf.firstUpdate = false;
		
		$.ajax(Job.conf.updStatusUrl, {type: 'POST', data: obj, dataType: 'xml'}).done(function(xml) {
			console.log('update status');
			if (xml) {
				var status = Number($(xml.documentElement).find('>status').text());
				if (status == -1) {
					Job.player.pause();
				}
				if (!Job.conf.historyId) {
					var historyId = Number($(xml.documentElement).find('>historyId').text());
					if (historyId) Job.conf.historyId = historyId;
				}
				window.onUpdstatus && window.onUpdstatus(status);
			}
		}).always(function() {
			st_updating = false;
		});
	},

	popWnd: function(wnd) {
		$('#job_mask').show();
		Job.centerWnd(wnd.show());
	},

	removeWnd: function(wnd) {
		$('#job_mask').hide();
		wnd.hide();
	},

	centerWnd: function(wnd) {
		var p = Job.player.isFullscreen() ? $(window) : wnd.offsetParent();
		wnd.css('top', (p.height() - wnd.height()) / 2)
			.css('left', (p.width() - wnd.width()) / 2);
	},

	hideAllWnd: function() {
		Job._quietOn = true;
		this.conf.isShowCatalog && this.hideCatalog();
		this.conf.isShowNote && this.hideNote();
		this.conf.isShowSetup && this.hideSetup();
		this.conf.isShowBug && this.hideBug();
		Job._quietOn = false;
		//Job.refreshBtnState();
	},

	refreshBtnState: function() {
		var btns = ['job_catalog_btn', 'job_note_btn', 'job_bug_btn', 'job_setup_btn', 'job_subtitle_btn'];
		var btnCfgs = ['isShowCatalog', 'isShowNote', 'isShowBug', 'isShowSetup', 'isShowSubtitle'];
		$.each(btns, function(i, id) {
			$('#'+id).toggleClass('on', Job.conf[btnCfgs[i]]);
		});
	},

	resizeWnd: function(wnd) {
		var p = Job.player.isFullscreen() ? $(window) : wnd.offsetParent();
		wnd.css('top', (p.height() - wnd.height()) / 2);
	},

	slideOutWnd: function(wnd) {
		wnd.addClass('show');
	},

	slideInWnd: function(wnd) {
		wnd.removeClass('show');
		/*
		var old_width = wnd.width();
		wnd.animate({width: 0}, function() {
			wnd.hide();
			wnd.width(old_width);
		});
		*/
	},
	/**
	* 取得目录
	*/
	getCatalogXml: function() {
		if (this.conf.catalogUrl == '')
			return;
		return $.ajax(this.conf.catalogUrl, {dataType: 'xml'}).done(function(xml) {
			Job.conf.catalogXML = xml;
		});
	},

	showCatalog: function() {
		this.hideAllWnd();
		if (!this.conf.catalog_init) {
			this.catalogWnd.setSource();
		} else {
			this.catalogWnd.locate();
		}
		this.slideOutWnd($('#catalog_wnd'));
		//$('#catalog_wnd').show();
		this.resizeWnd($('#catalog_wnd'));
		this.conf.isShowCatalog = true;
		Job.refreshBtnState();
	},

	hideCatalog: function() {
		Job.slideInWnd($('#catalog_wnd'));
		Job.conf.isShowCatalog = false;
		Job._quietOn || Job.refreshBtnState();
	},
	/**
	* 取得笔记
	*/
	getNoteXml: function() {
		if (this.conf.viewFlag || this.conf.noteUrl == '')
			return;
		return $.ajax(this.conf.noteUrl, {data: {scoId: Job.conf.scoId}, dataType: 'xml'}).done(function(xml) {
			Job.conf.noteXML = xml;
		});
	},

	showNote: function() {
		this.hideAllWnd();
		if (!this.conf.note_init) {
			this.noteWnd.setSource();
		}
		this.slideOutWnd($('#note_wnd'));
		//$('#note_wnd').show();
		this.resizeWnd($('#note_wnd'));
		this.conf.isShowNote = true;
		Job.refreshBtnState();
	},

	hideNote: function() {
		Job.slideInWnd($('#note_wnd'));
		Job.conf.isShowNote = false;
		Job._quietOn || Job.refreshBtnState();
	},

	showBug: function() {
		this.hideAllWnd();
		if (!this.conf.bug_init) {
			this.bugWnd.setSource();
		} else {
			this.bugWnd.show_init();
		}
		this.bugWnd.showTime();
		this.slideOutWnd($('#bug_wnd'));
		//$('#bug_wnd').show();
		this.resizeWnd($('#bug_wnd'));
		this.conf.isShowBug = true;
		Job.refreshBtnState();
	},

	hideBug: function() {
		Job.slideInWnd($('#bug_wnd'));
		Job.conf.isShowBug = false;
		Job._quietOn || Job.refreshBtnState();
	},

	showBugTip: function(text) {
		Job.bugTip.show(text);
	},

	showTip: function(text) {
		Job.errorTip.show(text);
	},
		
	//显示设置窗口
	showSetup: function(){
		this.hideAllWnd();
		/*
		if (!this.conf.setup_init) {
			this.setupWnd.setSource();
		} else {
			this.setupWnd.init_quality();
		}
		*/
		if (!this.setupWnd.inited) {
			this.setupWnd.init();
		}
		this.slideOutWnd($('#setup_wnd'));
		//$('#bug_wnd').show();
		this.resizeWnd($('#setup_wnd'));
		Job.conf.isShowSetup = true;
		Job.refreshBtnState();
	},
	//隐藏设置窗口
	hideSetup: function(){
		Job.slideInWnd($('#setup_wnd'));
		Job.conf.isShowSetup = false;
		Job._quietOn || Job.refreshBtnState();
	},

	//显示字幕
	showSubtitle: function() {
		Job.subtitle.show();
		Job.conf.isShowSubtitle = true;
		Job.refreshBtnState();
	},
	//隐藏字幕
	hideSubtitle: function() {
		Job.subtitle.hide();
		Job.conf.isShowSubtitle = false;
		Job.refreshBtnState();
	},
	//暂停字幕
	pauseSubtitle: function() {
		if (Job.conf.isShowSubtitle)
			Job.subtitle.pause();
	},
	//恢复字幕
	resumeSubtitle: function() {
		if (Job.conf.isShowSubtitle)
			Job.subtitle.resume();
	},
	//重载字幕
	reloadSubtitle: function() {
		if (Job.conf.isShowSubtitle)
			Job.subtitle.reload();
	},

	changeQuality: function(quality) {
		var fileUrl = Job.conf.fileUrls[quality];
		var start_time = Job.conf.lastViewedTime;
		var medias = {src: fileUrl};
		if (fileUrl.match(/\.flv$/i)) medias.type = 'video/flv';
		//else if (fileUrl.match(/\.m3u8$/i)) medias.type = 'application/x-mpegURL';
		else medias.type = 'video/mp4';
		Job.conf.is_hls = /\.m3u8$/i.test(fileUrl);
		Job.player.src(medias).one('loadedmetadata', function() {
			Job.player.currentTime(start_time).play();
		});
		Job.conf.fileQuality = quality;
	},

	changeRate: function(rate) {
		Job.setAddTime();
		Job.player.tech.setPlaybackRate(rate);
		Job.conf.videoRate = rate;
	},

	changeVideo: function(configurl) {
		Job.player.pause();
		Job.hideAllWnd();
		Job.conf.isShowQuiz && Job.removeWnd($('#quiz_wnd'));
		Job.hideSubtitle();
		this.getConfig(configurl).done(function() {
			Job.getXML();

			//titletip
			$('#job_titletip').text(Job.conf.scoTitle);

		});
	},

	showReplay: function() {
		if (!Job.replay.inited) {
			Job.replay.init();
		}
		$('#job_replay').fadeIn();
	},

	hideReplay: function() {
		$('#job_replay').hide();
	},

	/*
	slidePbar: function(e) {
		if (p_moving) return false;

		var handle = $(this);
		p_dx = e.clientX - handle.parent().width();

		$(document).mousemove(Job.movePbar)
			.mouseup(Job.upPbar);
		p_moving = true;
		p_moved = false;

		//isie && this.setCapture();
		return false;
	},
	*/
	movePbar: function(e) {
		var per = this.calculateDistance(e);
		var handle = Job.container.find('.vjs-seek-handle');
		var handlePercent = handle.width() / this.width();
		var adjustedProgress = per * (1 - handlePercent);
		var barProgress = adjustedProgress + (handlePercent / 2);
		handle.css('left', adjustedProgress*100+'%');
		Job.container.find('.vjs-play-progress').width(barProgress*100+'%');
	},
	upPbar: function(e) {
		var per = this.calculateDistance(e);
		if (Job.backOnlyCheck(per)) {
			Job.player.currentTime(Job.player.duration()*per);
		}
		//else this.update();
		videojs.SeekBar.prototype.onMouseUp.call(this, e);
		//isie && $(copts.handle)[0].releaseCapture();
	},

	showProgress: function(e) {
		/*
		var ret = Job.getSeekPercent(e, true);
		var per = ret[0], offsetX = ret[1];
		if (!per) return;
		*/
		var seekBar = Job.player.controlBar.progressControl.seekBar;
		var per = seekBar.calculateDistance(e);
		var tipBox = $('#job_progress_tip');
		var offsetX = seekBar.width() * per - tipBox.width() / 2 + 8;
		var time = Job.utils.format_time(vjs.round(Job.player.duration() * per, 2));
		tipBox.text(time).css('left', offsetX).show();
	},

	hideProgress: function() {
		$('#job_progress_tip').hide();
	},

	backOnlyCheck: function(per) {
		//判断是否backonly
		if (!Job.conf.viewFlag && Job.conf.backOnly && Job.conf.totalTime > 0) {
			if (!per) return true;
			var pos = Job.player.duration() * per;
			if (pos > Job.conf.maxViewedTime) {
				Job.showBackOnlyTip();
				return false;
			}
		}
		return true;
	},

	/*
	getSeekPercent: function(e, returnOffset) {
		var pbar = Job.container.find('.vjs-progress-holder');
		var offsetX = Job.utils.getOffsetX(e, pbar);
		//if (e.offsetX == undefined) e.offsetX = Job.utils.getOffsetX(e);
		var boxWidth = pbar.width();
		var per = Math.min((offsetX) / boxWidth, 1);
		if (!per) return 0;
		var handlePercent = Job.container.find('.vjs-seek-handle').width() / boxWidth;
		var per2 = Math.min((per-handlePercent/2) / (1-handlePercent), 1);
		return returnOffset ? [per2, offsetX] : per2;
	},
	*/

	showBackOnlyTip: function() {
		Job.showTip('不能拖动至未看过的内容');
	},

	resizeLogo: function() {
		if (!Job.conf.use_logo) return;
		var videoWidth, videoHeight, playerWidth, playerHeight, margin, pos_right, pos_top;
		if (Job.player.techName == 'Html5') {
			videoWidth = Job.player.tech.el().videoWidth;
			videoHeight = Job.player.tech.el().videoHeight;
		} else {
			videoWidth = Job.player.tech.videoWidth();
			videoHeight = Job.player.tech.videoHeight();
		}
		playerWidth = Job.container.width();
		playerHeight = Job.container.height();
		margin = !Job.player.isFullscreen() ? 15 : 25;
		if (playerWidth / playerHeight > videoWidth / videoHeight) {
			pos_right = (playerWidth - playerHeight * videoWidth / videoHeight) / 2 + margin;
			pos_top = margin;
		} else {
			pos_right = margin;
			pos_top = (playerHeight - playerWidth * videoHeight / videoWidth) / 2 + margin;
		}
		$('#job_logo').css({right: pos_right, top: pos_top});
	}
};

Job.ConfCls = function(){
	this.fileUrls = {};
	this._quizScores = {};
	this.subtitleArray = [];
	this.quizTimeArray = [];
	this.bugTimeArray = [];
	this.dtd_duration = $.Deferred();
	this.dtd_canplay = $.Deferred();
	if (Job.options.showAd)
		this.dtd_ad_over = $.Deferred();
};
Job.ConfCls.prototype = {
	userId: '', //用户id
	courseId: 0, //课程id
	scoId: 0, //课件id
	scoTitle: '', //课件标题
	historyId: 0, //看课历史id

	fileUrls: {},
	fileQuality: 'normal', //视频质量 normal/high  默认为normal
	videoRate: 4, //倍速播放
	enableVideoRate: false,
	finish: false, //是否完成观看
	autostart: true,  //是否自动开始播放
	//是否hls, 修复hls拖动卡住
	is_hls: false,
	title_duration: 18, //片头长度，默认18秒
	dtd_ad_over: null, //片头广告deffered对象
	adUrl: '', //片头广告地址
	show_ad: false, //是否显示片头广告
	use_marquee: false, //是否启用跑马灯
	use_logo: false, //是否显示Logo
	noLogo: false, //是否不需要Logo

	totalTime: 0, //播放总时间

	cp_one: 0,
	cp_two: 0,
	cp_three: 0,
	hasCheckOne: false,	//课间播放第一个检查点
	hasCheckTwo: false,	//课件播放第二个检查点
	hasCheckThree: false,	//课件播放第三个检查点

	/**是否只能按顺序查看课程，true：不能往前拖动，要配合maxViewedTime*/
	backOnly: false,
	maxViewedTime: 0, //学习时间的最大值
	lastViewedTime: 0, //最后一次退出的时间点
	startTime: 0, //开始的时间（读取配置中的lastViewedTime）
	updInterval: 30, //每隔几秒钟提交一次学习状态到服务器
	updTimer: null,
	updAddTime: 0,
	updStime: 0,

	isShowCatalog: false, //目录是否已经显示
	isShowNote: false, //笔记是否已经显示
	isShowBug: false, //纠错是否已经显示
	isShowSetup: false, //设置窗口是否已经显示
	isShowSubtitle: false, //字幕是否已经显示
	isShowQuiz: false, //测验是否已经显示

	catalog_init: false,
	note_init: false,
	bug_init: false,
	setup_init: false,

	catalogUrl: "",//目录xml的url
	quizUrl: "",//测验提xml的url
	noteUrl: "",//笔记xml的url
	bugUrl: "",//纠错xml的url
	subtitleUrl: "",//字幕xml的url
	updStatusUrl: "",//更新状态的url
	quizPostUrl: "",//测验提交的url
	bugPostUrl: "",//bug提交的url
	
	firstUpdate: true,//是否是第一次提交，用于更新时判断是否更新用户的学习次数
	
	quizWin: null,
	lastQuizTime: -1,  //测验检查时防止重复
	quizFinish: false,
	quizXML: null,
	quizIndex: 0, //当前是第几个测验，索引数
	quizScore: 0, //课间练习得分
	_quizScores: {}, //课间练习得分
	testScore: 0, //课后练习得分
	catalogXML: null,
	noteXML: null, //笔记XML
	bugXML: null, //纠错XML
	subtitleType: '', //字幕类型
	subtitleXML: null, //字幕XML
	subtitleArray: [], //字幕数组
	
	viewFlag: false,  //是否只是用来预览
	faceFlag: false,  //是否需要人脸识别
	faceUrl: '', //人脸识别上传地址
	personId: '', //人脸识别用的人员id

	//isManualSeek: false, //是否是在目录窗口手动点击跳转
	
	/**
	 * 存放习题播放时间,默认播放时间是经过排序的从小到大排序
	 */
	quizTimeArray: [],
	testIndex: -1, //课后习题的索引
	bugTimeArray: [],
	bugIndex: -1,

	set_totalTime: function(value) {
		this.totalTime = value;
		this.cp_one = (value - 3) / 3;
		this.cp_two = (value - 3) * 2 / 3;
		this.cp_three = value -3;
		//var isResolved = Job.conf.dtd_duration.state ? Job.conf.dtd_duration.state() == 'resolved' : Job.conf.dtd_duration.isResolved();
		Job.conf.dtd_duration.resolve();
	},
	/*
	get totalTime() {
		return this._totalTime;
	},
	*/
	//设置测验xml时，同时更新quizTimeArray内容
	set_quizXML: function(xml) {
		this.quizXML = xml;
		$(xml.documentElement).children().each(function(i) {
			var showTime = Number($(this).attr('showTime'));
			var isTest = $(this).attr('isTest');
			if (isTest == 'false') {
				Job.conf.quizTimeArray.push(showTime);
			} else {
				Job.conf.testIndex = i;
			}
		});
	},
	/*
	get quizXML() {
		return this._quizXML;
	},
	*/
	//设置bugxml时，同时更新bugTimeArray内容
	set_bugXML: function(xml) {
		this.bugXML = xml;
		$(xml.documentElement).children().each(function() {
			var showTime = Number($(this).find('>time').text());
			Job.conf.bugTimeArray.push(showTime);
		});
	},
	/*
	get bugXML() {
		return this._bugXML;
	},
	*/

	set_subtitle: function() {
		var start_time, end_time;
		if (this.subtitleType == 'xml') {
			var source = $(this.subtitleXML.documentElement).children();
			for (var i=0; i<source.length; i++) {
				var item = source.eq(i);
				start_time = Number(item.attr('start'));
				end_time = Number(item.attr('end'));
				this.subtitleArray.push({start: start_time, end: end_time, text: item.text()});
			}
		} else if (this.subtitleType == 'srt') {
			//var p = /^\d+\n(.+)\n((?:.+\n)+)/gm;
			var nl = '(?:\\r\\n|\\r|\\n)';
			var p = new RegExp('^\\d+'+nl+'(.+)'+nl+'((?:.+'+nl+')+)', 'gm'),
				p2 = /(\S+) --> (\S+)/;
			var m, m2;
			while (m = p.exec(this.subtitleXML)) {
				m2 = m[1].match(p2);
				start_time = Job.utils.c2time(m2[1]);
				end_time = Job.utils.c2time(m2[2]);
				var subtitle = $.trim(m[2]);
				this.subtitleArray.push({start: start_time, end: end_time, text: subtitle});
			}
		}
	},

	set_quizScore: function(score, isTest) {
		if (!isTest) {
			this._quizScores[this.quizIndex] = Math.max(this._quizScores[this.quizIndex] || 0, score);
			var scores = 0;
			for (var i in this._quizScores) {
				scores += this._quizScores[i];
			}
			this.quizScore = scores;
		} else {
			this.testScore = Math.max(this.testScore, score);
		}
	}

	/*
	get quizScore() {
		return this._quizScore;
	}
	*/
};

Job.utils = {
	cbool: function(v) {
		if (!v) return false;
		return v != 'false';
	},

	joinUrl: function(url, param) {
		return url + (url.indexOf('?') > -1 ? '&' : '?') + param;
	},

	format_time: function(time) {
		var min = Math.floor(time/60);
		var sec = Math.floor(time%60);  
		var timeResult = (min < 10 ? "0"+min.toString() : min.toString()) + ":" + (sec < 10 ? "0"+sec.toString() : sec.toString());
		return timeResult;
	},

	//srt字幕时间转换
	c2time: function(tstr) {
		var p = /(\d+):(\d+):(\d+),(\d+)/;
		var t = tstr.match(p);
		return parseInt(t[1])*60*60 + parseInt(t[2])*60 + parseInt(t[3]) + parseInt(t[4])/1000;
	},

	init_radio: function(selector) {
		$(selector).each(function() {
			$(this).parent().toggleClass('on', $(this).prop('checked'));
		});
	},

	getOffsetX: function(e, p) {
		p = p || e.target;
		return e.pageX - $(p).offset().left;
	}
};

Job.catalogWnd = {
	inited: false,
	init: function() {
		this.inited = true;
		$('#catalog_wnd>.job-slidein-btn').click(Job.hideCatalog);
		//目录点击
		//$('#job_catalist').on('click', 'a', function() {
		$('#job_catalist').delegate('a', 'click', function() {
			var time = Number($(this).attr('time'));
			if (!Job.conf.viewFlag && Job.conf.backOnly && time > Job.conf.maxViewedTime) {
				Job.showBackOnlyTip();
				return;
			}
			Job.player.currentTime(time);
		});
	},

	setSource: function() {
		if (!this.inited) this.init();
		$('#job_catalist').html('');
		$.when(Job.getCatalogXml()).done(function() {
			Job.conf.catalog_init = true;
			if (Job.conf.catalogXML) {
				var html = '';
				$(Job.conf.catalogXML.documentElement).children().each(function() {
					var time = Number($(this).attr('time'));
					var min = Math.floor(time/60);
					var sec = Math.floor(time%60);  
					var timeResult = (min < 10 ? "0"+min.toString() : min.toString()) + ":" + (sec < 10 ? "0"+sec.toString() : sec.toString());
					var showText = $(this).attr('label') + " (" + timeResult+")";
					html += '<li><a href="javascript:;" time="'+time+'" title="'+$.trim(showText)+'">'+showText+'</a></li>';
				});
				$('#job_catalist').html(html);
				Job.catalogWnd.locate();
			}
		});
	},

	locate: function() {
		if (!Job.conf.catalogXML) return;
		this.updateColor();

		var cur_time = Math.round(Job.conf.lastViewedTime);
		var last_idx = -1;
		var found = false;
		//for each (var item:XML in model.catalogXML) {
		$(Job.conf.catalogXML.documentElement).children().each(function(n) {
			var time = Number($(this).attr('time'));
			if (cur_time >= time) {
				last_idx = n;
				return;
			}
			found = true;
			if (last_idx > -1) {
				Job.catalogWnd.setSel(last_idx);
				return false;
			}
		});
		if (!found && last_idx > -1) {
			this.setSel(last_idx);
		}
	},

	setSel: function(i) {
		$('#job_catalist>li').eq(i).find('>a').addClass('current').end().siblings().find('>a').removeClass('current');
	},

	updateColor: function() {
		$('#job_catalist>li>a').each(function() {
			var mt = Job.conf.maxViewedTime;
			var time = Number($(this).attr('time'));
			if (time <= mt) $(this).addClass('viewed');
			else return false;
		});
	}
};

Job.noteWnd = {
	inited: false,
	init: function() {
		this.inited = true;
		$('#note_wnd>.job-slidein-btn').click(Job.hideNote);
		//点击
		//$('#job_notelist').on('click', 'a.job-note-itm', function() {
		$('#job_notelist').delegate('a.job-note-itm', 'click', function() {
			var time = Number($(this).attr('time'));
			Job.player.currentTime(time);
		});
		//删除按钮
		//$('#job_notelist').on('click', 'a.job-del-btn', function() {
		$('#job_notelist').delegate('a.job-del-btn', 'click', function() {
			if (!confirm('确定要删除这个笔记项吗？')) return;
			$.ajax(Job.conf.noteUrl, {data: {
					act: 'del',
					noteId: $(this).parent().attr('noteid'),
					userId: Job.conf.userId,
					scoId: Job.conf.scoId
				}, dataType: 'xml'}).done(function(xml) {
				Job.conf.noteXML = xml;
				Job.noteWnd.setSource();
			});
		});
		//添加按钮
		$('#job_addnote').click(function() {
			var text = $.trim($('#job_notetxt').val());
			if (!text) {
				alert('笔记的内容不可为空');
				return;
			}
			$.ajax(Job.conf.noteUrl, {type: 'POST', data: {
					act: 'add',
					userId: Job.conf.userId,
					scoId: Job.conf.scoId,
					courseId: Job.conf.courseId,
					note: text,
					note_time: Job.conf.lastViewedTime
				}, dataType: 'xml'}).done(function(xml) {
				Job.conf.noteXML = xml;
				Job.noteWnd.setSource();
				$('#job_notetxt').val('');
			});
		});
	},

	setSource: function() {
		if (!this.inited) this.init();
		$('#job_notelist').html('');
		$.when(Job.getNoteXml()).done(function() {
			Job.conf.note_init = true;
			if (Job.conf.noteXML) {
				var html = '';
				$(Job.conf.noteXML.documentElement).children().each(function() {
					var time = Number($(this).attr('time'));
					var timeResult = Job.utils.format_time(time);
					var showText = " (" + timeResult+")";
					html += '<li noteid="'+$(this).attr('noteId')+'"><a href="javascript:;" class="job-note-itm" time="'+time+'" title="单击跳转到笔记记录位置">'+$(this).attr('label')+'<span>'+showText+'</span></a><a href="javascript:;" class="job-del-btn"></a></li>';
				});
				$('#job_notelist').html(html);
			}
		});
	}
};

Job.bugWnd = {
	inited: false,
	currentIndex: 0,
	init: function() {
		this.inited = true;
		$('#bug_wnd>.job-slidein-btn').click(Job.hideBug);
		//上一条/下一条
		$('#job_prevbug').click(function() {
			if ($(this).hasClass('gray')) return;
			var index = Job.bugWnd.currentIndex - 1;
			Job.bugWnd.showBug(index);
		});
		$('#job_nextbug').click(function() {
			if ($(this).hasClass('gray')) return;
			var index = Job.bugWnd.currentIndex + 1;
			Job.bugWnd.showBug(index);
		});
		//提交按钮
		$('#job_subbug').click(function() {
			var bug_time = $('#job_bug_time').val();
			var bug_content = $.trim($('#job_bug_content').val());
			if (!bug_content) {
				alert('纠错内容不可为空');
				return;
			}
			if (!bug_time) {
				alert('纠错时间不可为空');
				return;
			}
			$.ajax(Job.conf.bugPostUrl, {type: 'POST', data: {
					act: 'add',
					userId: Job.conf.userId,
					scoId: Job.conf.scoId,
					courseId: Job.conf.courseId,
					bug_content: bug_content,
					bug_time: bug_time
				}}).done(function() {
				$('#job_bug_content').val('');
				$('#bug_form').hide();
				$('#bug_history').show();
				alert("谢谢您的意见，我们会尽快处理，处理结果可以在课程纠错模块中查询");
			});
		});
		$('#job_viewbug').click(function() {
			$('#bug_form').hide();
			$('#bug_history').show();
		});
	},

	setSource: function() {
		if (!this.inited) this.init();
		$('#job_bugshow').text('');
		Job.conf.bug_init = true;
		this.show_init();
		if (!Job.conf.bugXML) {
			$('#job_prevbug').addClass('gray');
			$('#job_nextbug').addClass('gray');
		} else {
			this.showBug(0);
		}
	},

	show_init: function() {
		if (!Job.conf.viewFlag) {
			$('#bug_form').show();
			$('#bug_history').hide();
		} else {
			$('#bug_form').hide();
			$('#bug_history').show();
		}
	},

	showBug: function(index) {
		if (!Job.conf.bugXML) return;
		var list = $(Job.conf.bugXML.documentElement).children();
		if (index < 0) {
			alert('已到第一条');
			return;
		}
		if (index >= list.length) {
			alert('已到最后一条');
			return;
		}
		if (index < 0 || index >= list.length) return;
		var item = list.eq(index);
		var time = item.find('>time').text();
		var content = item.find('>content').text();
		currentBug = "视频的" + Job.bugWnd.format_time(time) + "更正：" + content;
		$('#job_bugshow').text(currentBug);
		Job.bugWnd.currentIndex = index;
		//检查是否已到第一条或最后一条
		if (index == 0) {
			$('#job_prevbug').addClass('gray');
		} else {
			$('#job_prevbug').removeClass('gray');
		}
		if (index == list.length - 1) {
			$('#job_nextbug').addClass('gray');
		} else {
			$('#job_nextbug').removeClass('gray');
		}
	},

	format_time: function(time) {
		var min = Math.floor(time/60);  
		var sec = Math.floor(time%60);  
		var timeResult = (min < 10 ? "0"+min.toString() : min.toString()) + "分" + (sec < 10 ? "0"+sec.toString() : sec.toString() + "秒");
		return timeResult;
	},

	showTime: function() {
		var time = Math.round(Job.conf.lastViewedTime);
		$('#job_bug_time').val(this.format_time(time));
	}
};

Job.bugTip = {
	inited: false,
	init: function() {
		this.inited = true;
		$('#job_bugtip>.job-tclose-btn').click(this.showFade);
	},

	/*
	get text() {
		return $('#job_bugtip_txt').text();
	},
	set text(s) {
		$('#job_bugtip_txt').text(s);
	},
	*/
	show: function(text) {
		if (!Job.bugTip.inited) Job.bugTip.init();
		$('#job_bugtip').stop().show();
		//Job.bugTip.text = text;
		$('#job_bugtip_txt').text(text);
	},
	showFade: function() {
		$('#job_bugtip').fadeOut();
	}
};

Job.subtitle = {
	inited: false,
	showTimer: null,
	hideTimer: null,
	source: null,

	init: function() {
		this.inited = true;
		this.source = Job.conf.subtitleArray;
	},

	/*
	get text() {
		return $('#job_subtitle').text();
	},
	set text(txt) {
		$('#job_subtitle').text(txt);
	},
	*/

	showHandler: function() {
		Job.subtitle.showTimer = null;
		$('#job_subtitle').show();
		var item = Job.subtitle.source[Job.subtitle.idx];
		var end_time = item.end;
		var cur_time = Job.conf.lastViewedTime;
		//Job.subtitle.text = item.text();
		$('#job_subtitle').text(item.text);
		var delay = (end_time - cur_time) * 1000;
		if (delay <= 0) {
			//console.log(end_time, cur_time);
			Job.subtitle.idx++;
			hideHandler();
			return;
		}
		if (!Job.player.paused()) {
			Job.subtitle.idx++;
			Job.subtitle.hideTimer = setTimeout(Job.subtitle.hideHandler, delay);
		}
	},
	hideHandler: function() {
		Job.subtitle.hideTimer = null;
		$('#job_subtitle').hide();
		Job.subtitle.showNext();
	},
	showNext: function() {
		//确定在字幕的哪个位置
		var cur_time = Job.conf.lastViewedTime;
		for (var i=this.idx; i<this.source.length; i++) {
			var item = this.source[i];
			//console.log(item);
			var start_time = item.start;
			var end_time = item.end;
			//console.log(start_time, end_time, cur_time);
			if (cur_time < start_time) {
				this.idx = i;
				if (!Job.player.paused())
					this.showTimer = setTimeout(this.showHandler, (start_time - cur_time) * 1000);
				break;
			}
			if (cur_time < end_time) {
				this.idx = i;
				this.showHandler();
				break;
			}
		}
	},
	show: function() {
		if (!this.inited) this.init();
		this.idx = 0;
		//resize();
		this.showNext();
	},
	hide: function() {
		if (this.showTimer) {
			clearTimeout(this.showTimer);
			this.showTimer = null;
		}
		if (this.hideTimer) {
			clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}
		$('#job_subtitle').hide();
	},
	
	//暂停
	pause: function() {
		if (this.showTimer) {
			clearTimeout(this.showTimer);
			this.showTimer = null;
		}
		if (this.hideTimer) {
			clearTimeout(this.hideTimer);
			this.hideTimer = null;
			this.idx && this.idx--;
		}
	},
	//恢复
	resume: function() {
		this.showNext();
	},
	//重载
	reload: function() {
		if (this.showTimer) {
			clearTimeout(this.showTimer);
			this.showTimer = null;
		}
		if (this.hideTimer) {
			clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}
		$('#job_subtitle').hide();
		this.idx = 0;
		this.showNext();
	}
};

scale = function (btn, bar, dbtn, fname) {
	this.btn = document.getElementById(btn);
	this.bar = document.getElementById(bar);
	//this.title = document.getElementById(title);
	this.dbtn = document.getElementById(dbtn);
	this.fname = fname;
	this.step = this.bar.getElementsByTagName("DIV")[0];
	this.init();
};
scale.prototype = {
	init: function () {
		var f = this, g = document, b = window, m = Math;
		f.btn.onmousedown = function (e) {
			var x = (e || b.event).clientX;
			var l = this.offsetLeft;
			var max = f.bar.offsetWidth - this.offsetWidth;
			g.onmousemove = function (e) {
				var thisX = (e || b.event).clientX;
				var to = m.min(max, m.max(-2, l + (thisX - x)));
				f.btn.style.left = to + 'px';
				f.ondrag(m.round(m.max(0, to / max) * 100), to);
				b.getSelection ? b.getSelection().removeAllRanges() : g.selection.empty();
			};
			g.onmouseup = new Function('this.onmousemove=null');
		};
		//初始值
		var to = this.bar.offsetWidth / 2 - 1;
		f.btn.style.left = to + 'px';
		f.step.style.width = to + 'px';
		//默认按钮
		f.dbtn.onclick = function() {
			f.set_default();
		};
	},
	ondrag: function (pos, x) {
		this.step.style.width = Math.max(0, x) + 'px';
		//this.title.innerHTML = pos / 10 + '';
		this.set_val(pos / 50);
	},
	set_val: function(val) {
		image_sets[this.fname] = val;
		if (Job.player.techName == 'Html5') {
			Job.container.find('.vjs-tech').css('filter', 'brightness('+image_sets.brightness+') contrast('+image_sets.contrast+')');
		} else {
			try {
				Job.player.tech.el().job_setvfilter(this.fname, val);
			} catch (e) {}
		}
		
	},
	set_default: function() {
		var to = this.bar.offsetWidth / 2 - 1;
		this.btn.style.left = to + 'px';
		this.step.style.width = to + 'px';
		this.set_val(1);
	}
}

Job.setupWnd = {
	inited: false,
	init: function() {
		this.inited = true;
		$('#setup_wnd>.job-slidein-btn').click(Job.hideSetup);
		new scale('eb_btn0', 'eb_bar0', 'eb_dbtn0', 'brightness'); //亮度
		new scale('eb_btn1', 'eb_bar1', 'eb_dbtn1', 'contrast'); //对比度
		/*
		$('#job_setqua').click(this.submit);
		$('#job_cancelqua').click(Job.hideSetup);
		*/
	},

	setSource: function() {
		if (!this.inited) this.init();
		$('#job_qualist').html('');
		Job.conf.setup_init = true;
		var labels = [['normal', '标清'], ['high', '高清'], ['mobile', '移动']];
		$.each(labels, function(i, label) {
			if (!Job.conf.fileUrls[label[0]]) return;
			var radio = '<li><label class="radio"><input type="radio" name="quality" value="'+label[0]+'"/>'+label[1]+'</label></li>';
			$('#job_qualist').append(radio);
		});
		this.init_quality();
	},

	init_quality: function() {
		$('#setup_form :radio').val([Job.conf.fileQuality]);
		Job.utils.init_radio('#setup_form :radio');
	},

	submit: function() {
		var new_quality = $('#setup_form :checked').val();
		if (!new_quality) return;
		if (new_quality != Job.conf.fileQuality) {
			Job.changeQuality(new_quality);
		}
		Job.hideSetup();
	}
};

Job.QuizWnd = function(xml) {
	if (!$('#quiz_wnd').data('inited')) Job.QuizWnd.init();
	//if (!Job.QuizWnd.inited) Job.QuizWnd.init();
	this.setSource(xml);
};
Job.QuizWnd.inited = false;
Job.QuizWnd.init = function() {
	//Job.QuizWnd.inited = true;
	$('#quiz_wnd').data('inited', true);
	function proxy(fname) {
		return function() {
			Job.conf.quizWin[fname]();
		};
	}
	if (Job.conf.viewFlag)
		$('#quiz_wnd .job-close-btn').click(Job.closeQuiz);
	else
		$('#quiz_wnd .job-close-btn').click(proxy('skip'));
	$('#job_quizsub').click(proxy('submit'));
	$('#job_quizskip').click(proxy('skip'));
	$('#job_quizview').click(proxy('review'));
	$('#job_quizreset').click(proxy('reset'));
	$('#job_quizfinish').click(proxy('finish'));
};
Job.QuizWnd.prototype = {
	quizNum: 0,
	quizCorrectNum: 0,
	allPass: false,
	quizScore: 0,
	isTest: false,
	canSkip: false,
	questionsXml: null,
	copyXml: null,

	setSource: function(xml) {
		this.questionsXml = xml;
		this.copyXml = this.questionsXml.children();
		this.isTest = this.questionsXml.attr('isTest') == 'true' ? true : false;
		this.canSkip = this.questionsXml.attr('canSkip') == 'true' ? true : false;
		$('#quiz_title').text(this.isTest ? "课后习题" : "课间习题");
		this.createPageOne();
		this.setSelectedPage(0);
	},

	createPageOne: function() {
		var html = '';
		this.copyXml.each(function(n) {
			var type = $(this).attr('type');
			var content = $(this).find('>content').text();
			html += '<li><dl score="'+$(this).attr('score')+'"><dt>'+content+'</dt>';
			var options = $(this).find('>answer>option');
			options.each(function(i) {
				var groupName;
				if(type=="S"||type=="P"){//单选题
					groupName = 'opt_'+n;
					html += '<dd><label class="radio"><input type="radio" name="'+groupName+'" value="'+i+'" flag="'+$(this).attr('flag')+'" />'+$(this).text()+'</label></dd>';
				}else if(type == "M"){
					groupName = 'opt_'+n+'[]';
					html += '<dd><label class="check"><input type="checkbox" name="'+groupName+'" value="'+i+'" flag="'+$(this).attr('flag')+'" />'+$(this).text()+'</label></dd>';
				}
			});
			html += '</dl></li>';
		});
		$('#job_quizlist').html(html);
		//Job.utils.init_radio('#job_quizlist :radio');
	},

	setSelectedPage: function(index, pass) {
		this.showPage(index);
		if(index==0){//做题页面
			this.setShow(true, 'job_quizsub', 'job_quizskip');
			this.setShow(false, 'job_quizview', 'job_quizfinish', 'job_quizreset');
		}else if(index == 1){//查看测试结果页面
			this.setShow(true, 'job_quizview');
			this.setShow(false, 'job_quizsub', 'job_quizskip');
			if(pass){
				this.setShow(true, 'job_quizfinish');
				this.setShow(false, 'job_quizreset');
			}else{
				this.setShow(true, 'job_quizreset');
				this.setShow(false, 'job_quizfinish');
			}
		}else if(index == 2){
			this.setShow(false, 'job_quizsub', 'job_quizskip', 'job_quizview');
			this.setShow(true, 'job_quizfinish', 'job_quizreset');
		}
	},

	showPage: function(index) {
		$('#job_quiz_box').children().eq(index).show().siblings().hide();	
	},

	setShow: function(visible) {
		$.each($.makeArray(arguments).slice(1), function(i, id) {
			$('#'+id).toggle(visible);
		});
	},

	testResult: function() {
		var pass = true;
		this.quizNum = this.copyXml.length;
		var num = 0;
		var scores = 0;
		$('#job_quizlist dl').each(function() {
			var correct = true;
			var options = $(this).find('input');
			var score = Number($(this).attr('score')) || 0;
			options.each(function() {
				var flag = $(this).attr('flag');
				var selected = $(this).prop('checked') ? 'Y' : 'N';
				if(flag != selected){
					correct = false;
					return false;
				}
			});
			if(correct) {
				num++;
				scores += score;
			}
		});
		this.quizCorrectNum = num;
		this.quizScore = scores;
		var perc = Number((this.quizCorrectNum/this.quizNum).toFixed(2));
		$('#quiz_resultLabel').text("您的成绩："+this.quizScore+"分 "+this.quizCorrectNum+"/"+ this.quizNum + " ("+perc*100 +"%)");
		//做到这里
		if(perc < 1){
			$('#quiz_infoLabel').removeClass('success').text('很遗憾，您没有通过达标分数！');
			$('#quiz_tipLabel').text('您可以点击"查看答案"进行回顾，或者点击"重做"。');
			pass = false;
		}else{
			$('#quiz_infoLabel').addClass('success').text('恭喜您通过达标分数！');
			$('#quiz_tipLabel').text('您可以点击"查看答案"进行回顾，或者点击"完成"。');
			pass = true;
		}
		return pass;
	},

	submit: function(){
		var pass = this.testResult();
		this.allPass = (this.allPass || pass);//是否通过，只要通过一次，就算通过，可以跳过或者完成
		this.setSelectedPage(1,pass);
		this.submitResult();
	},
	reset: function(){
		$('#job_quiz_form')[0].reset();
		Job.utils.init_radio('#job_quizlist :radio, #job_quizlist :checkbox');
		this.setSelectedPage(0);
	},
	skip: function(){
		if(this.canSkip || this.allPass){
			Job.closeQuiz();
		}else{
			alert("不能跳过习题，请正确完成答题！");
		}
		
	},
	submitResult: function() {
		//提交
		var obj = {};
		obj.userId = Job.conf.userId;
		obj.scoId = Job.conf.scoId;
		obj.courseId = Job.conf.courseId;
		obj.historyId = Job.conf.historyId;
		obj.quizCorrectNum = this.quizCorrectNum;
		obj.quizNum = this.quizNum;
		obj.allPass = this.allPass;
		obj.quizIndex = Job.conf.quizIndex;
		//Job.conf.quizScore = this.quizScore;
		Job.conf.set_quizScore(this.quizScore, this.isTest);
		obj.quizScore = this.quizScore;
		obj.quizScoreAll = Job.conf.quizScore;
		obj.isTest = this.isTest;

		$.ajax(Job.conf.quizPostUrl, {type: 'POST', data: obj}).done(function() {
			console.log('quiz post success');
		});
	},
	finish: function(){
		if(this.allPass){
			Job.closeQuiz();
		}else{
			alert("请完成所有答题后点击'完成'");
		}
	},
	/**
	 * 查看答案
	 */
	review: function(){
		$('#job_quizlist2').html($('#job_quizlist').html());
		$('#job_quizlist2 input').each(function() {
			$(this).prop('disabled', true).parent().addClass('gray');
			if ($(this).attr('flag') == 'Y')
				$(this).parent().parent().addClass('correct');
		});
		var dl1 = $('#job_quizlist dl');
		$('#job_quizlist2 dl').each(function(n) {
			var correct = true;
			var options = $(this).find('input');
			var opts1 = dl1.eq(n).find('input');
			options.each(function(i) {
				var flag = $(this).attr('flag');
				var checked = opts1.eq(i).prop('checked');
				$(this).prop('checked', checked);
				var selected = checked ? 'Y' : 'N';
				if(flag != selected){
					correct = false;
					//return false;
				}
			});
			if(correct) {
				$(this).find('dt').append('<span class="green">【回答正确】</span>');
			} else {
				$(this).find('dt').append('<span class="red">【回答错误】</span>');
			}
		});
		//Job.utils.init_radio('#job_quizlist2 :radio');
		this.setSelectedPage(2);
	}
};

Job.replay = {
	inited: false,
	init: function() {
		this.inited = true;
		$('#job_replay_btn').click(function() {
			Job.player.currentTime(0).play();
		});
		$('#job_nextvideo_btn').click(function() {
			window.nextVideo && window.nextVideo();
		});
	}
};

Job.errorTip = {
	/*
	get text() {
		return $('#job_errortip').text();
	},
	set text(s) {
		$('#job_errortip').text(s);
	},
	*/
	show: function(text, timeout) {
		timeout = timeout || 2000;
		$('#job_errortip').stop().show();
		//Job.errorTip.text = text;
		$('#job_errortip').text(text);
		Job.errorTip.resize();
		$('#job_errortip').delay(timeout).fadeOut();
	},
	//调整位置
	resize: function() {
		$('#job_errortip').css('marginLeft', -$('#job_errortip').width()/2);
	}
};

Job.marquee = {
	dom: null,
	width: 0,
	height: 0,
	top_min: 0,
	top_max: 0,
	/*
	lines: 0, //总行数
	line_idx: 0, //当前行
	line_height: 0, //行高
	*/
	distance: 0, //横跨距离
	move_duration: 1000, //跑完一个横屏的时间，毫秒
	colors: ['red', 'green', 'white', '#ff00ff', '#0099FF', '#FF9933'], //颜色
	running: false,
	started: false,

	init: function() {
		this.dom = $('#job_marquee');
		this.width = this.dom.width();
		this.height = this.dom.height();
		this.dom.hide().parent().hide();
	},

	begin: function() {
		Job.marquee.started = true;
		this.dom.parent().show();
		Job.marquee.calculate();
		Job.marquee.moveNext();
	},

	calculate: function() {
		//this.lines = Job.container.height() % this.height;
		var videoWidth, videoHeight, playerWidth, playerHeight;
		if (Job.player.techName == 'Html5') {
			videoWidth = Job.player.tech.el().videoWidth;
			videoHeight = Job.player.tech.el().videoHeight;
		} else {
			videoWidth = Job.player.tech.videoWidth();
			videoHeight = Job.player.tech.videoHeight();
		}
		playerWidth = Job.container.width();
		playerHeight = Job.container.height();

		var margin = !Job.player.isFullscreen() ? 5 : 10; //上下留白空间
		this.top_min = margin; //上下各留白50px
		this.top_max = Job.container.height()/4 - this.height;  //只在上面4分之一跑

		//this.distance = Job.container.width();
		if (playerWidth / playerHeight > videoWidth / videoHeight) {
			this.distance = Math.max(playerWidth * 0.9, playerHeight * videoWidth / videoHeight);  //跑屏距离为90%
			this.dom.parent().css({width: this.distance, left:(playerWidth-this.distance)/2});
		} else {
			this.distance = playerWidth;
			this.dom.parent().css({width:'100%', left:0});
			var diff_h = (playerHeight - playerWidth * videoHeight / videoWidth) / 2;
			this.top_min -= diff_h;
			this.top_max -= diff_h;
		}
		//this.move_duration = !Job.player.isFullscreen() ? 3000 : 3000 * Job.container.width() / Job.player.width();
		this.move_duration = Math.round((this.distance + this.width) * 60); //60毫秒移动1个像素
	},

	start: function() {
		this.running = true;
		this.move();
	},

	move: function() {
		this.dom.show();
		//先计算duration
		var full_distance = this.distance + this.width;
		var left_distance = parseInt(this.dom.css('left')) + this.width;
		var duration = this.move_duration * left_distance / full_distance;
		var me = this;
		this.dom.animate({left: -this.width}, {duration: duration, easing:'linear'}).queue(function() {
			me.running = false;
			me.pause();
			$(this).dequeue();
			$(this).delay(20000).queue(function() {
				me.moveNext();
				$(this).dequeue();
			});
		});
		/*
		this.dom.animate({left: -this.width}, {duration: duration, complete: function() {
			me.running = false;
			me.pause();
			console.log('kkkkk');
			setTimeout(function() {
				me.moveNext();
			}, 2000);
		}});
		*/
	},

	pause: function() {
		if (!this.started) return;
		this.dom.stop(true).hide();
	},

	resume: function() {
		if (!this.started) return;
		if (this.running) this.move();
		else {
			this.moveNext();
		}
	},

	moveNext: function() {
		//起始top值
		var x = this.top_min + Math.random() * (this.top_max - this.top_min);
		this.dom.css({left: this.distance, top: x});
		//颜色
		var color_idx = Math.floor(Math.random() * this.colors.length);
		this.dom.css('color', this.colors[color_idx]);
		this.start();
	},

	resize: function() {
		if (this.running) this.pause();
		var full_distance_old = this.distance + this.width;
		var left_distance_old = parseInt(this.dom.css('left')) + this.width;
		var top_max_old = this.top_max;
		var top_old = parseInt(this.dom.css('top'))
		this.calculate();
		var full_distance = this.distance + this.width;
		var left_distance = left_distance_old * full_distance / full_distance_old;
		var top = this.top_max * top_old / top_max_old;
		this.dom.css({left: left_distance - this.width, top: Math.min(top, this.top_max)});
		if (this.running) this.resume();
	}
};

//加载其它js文件
dtd_js = $.Deferred();
Job.loadscripts();

//IE7/- fix
if (!window.console) window.console = {log: function(){}};

//flash check
function flashChecker() {
    var hasFlash = 0;　　　　 //是否安装了flash
    var flashVersion = 0;　　 //flash版本
    if (document.all) {
		try {
			var swf = new ActiveXObject('ShockwaveFlash.ShockwaveFlash');
			if (swf) {
				hasFlash = 1;
				VSwf = swf.GetVariable("$version");
				flashVersion = parseInt(VSwf.split(" ")[1].split(",")[0]);
			}
		} catch (e) {}
    } else {
        if (navigator.plugins && navigator.plugins.length > 0) {
            var swf = navigator.plugins["Shockwave Flash"];
            if (swf) {
                hasFlash = 1;
                var words = swf.description.split(" ");
                for (var i = 0; i < words.length; ++i) {
                    if (isNaN(parseInt(words[i]))) continue;
                    flashVersion = parseInt(words[i]);
                }
            }
        }
    }
    return {
        f: hasFlash,
        v: flashVersion
    };
}
})();

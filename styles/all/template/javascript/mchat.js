/**
 *
 * @package phpBB Extension - mChat
 * @copyright (c) 2009 By Shapoval Andrey Vladimirovich (AllCity) ~ http://allcity.net.ru/
 * @copyright (c) 2013 By Rich McGirr (RMcGirr83) http://rmcgirr83.org
 * @copyright (c) 2015 By dmzx - http://www.dmzx-web.net
 * @copyright (c) 2016 By kasimi
 * @license http://opensource.org/licenses/gpl-license.php GNU Public License
 *
 */

// Support Opera
if (typeof document.hasFocus === 'undefined') {
	document.hasFocus = function() {
		return document.visibilityState == 'visible';
	};
}

Array.prototype.max = function() {
	return Math.max.apply(null, this);
};

Array.prototype.min = function() {
	return Math.min.apply(null, this);
};

jQuery.fn.reverse = function(reverse) {
	reverse = typeof reverse === 'undefined' ? true : reverse;
	return reverse ? $(this.toArray().reverse()) : this;
};

jQuery(function($) {
	var ajaxRequest = function(mode, sendHiddenFields, data) {
		var deferred = $.Deferred();
		var promise = deferred.promise();
		if (sendHiddenFields) {
			$.extend(data, mChat.hiddenFields);
		}
		$.ajax({
			url: mChat.actionUrls[mode],
			timeout: 5000,
			type: 'POST',
			dataType: 'json',
			data: data
		}).success(function(json, status, xhr) {
			if (json[mode]) {
				deferred.resolve(json, status, xhr);
			} else {
				deferred.reject(xhr, status, xhr.responseJSON ? 'session' : 'format');
			}
		}).error(function(xhr, status, error) {
			deferred.reject(xhr, status, error);
		});
		return promise.fail(function(xhr, textStatus, errorThrown) {
			mChat.sound('error');
			mChat.$$('refresh-load', 'refresh-ok', 'refresh-paused').hide();
			mChat.$$('refresh-error').show();
			if (errorThrown == 'format') {
				// Unexpected format
			} else if (errorThrown == 'session') {
				mChat.endSession();
				alert(mChat.sessOut);
			} else if (xhr.status == 400) {
				alert(mChat.flood);
			} else if (xhr.status == 403) {
				alert(mChat.noAccess);
			} else if (xhr.status == 413) {
				alert(mChat.mssgLngthLong);
			} else if (xhr.status == 501) {
				alert(mChat.noMessageInput);
			} else if (typeof console !== 'undefined' && console.log) {
				console.log('AJAX error. status: ' + textStatus + ', message: ' + errorThrown);
			}
		});
	};

	$.extend(mChat, {
		clear: function() {
			if (mChat.$$('input').val() !== '') {
				if (confirm(mChat.clearConfirm)) {
					mChat.resetSession(true);
					mChat.$$('input').val('');
				}
				mChat.$$('input').focus();
			}
		},
		sound: function(file) {
			if (!mChat.pageIsUnloading && !Cookies.get('mchat_no_sound')) {
				var audio = mChat.$$('sound-' + file).get(0);
				if (audio.duration) {
					audio.pause();
					audio.currentTime = 0;
					audio.play();
				}
			}
		},
		notice: function() {
			if (!document.hasFocus()) {
				$.titleAlert(mChat.newMessageAlert, {interval: 1000});
			}
		},
		toggle: function(name) {
			var $elem = mChat.$$(name);
			$elem.stop().slideToggle(function() {
				var cookieName = 'mchat_show_' + name;
				if ($elem.is(':visible')) {
					Cookies.set(cookieName, 'yes');
				} else {
					Cookies.remove(cookieName);
				}
			});
		},
		add: function() {
			if (mChat.$$('add').prop('disabled')) {
				return;
			}
			if ($.trim(mChat.$$('input').val()) === '') {
				return;
			}
			var messChars = mChat.$$('input').val().replace(/\s/g, '');
			if (mChat.mssgLngth && messChars.length > mChat.mssgLngth) {
				alert(mChat.mssgLngthLong);
				return;
			}
			mChat.pauseSession();
			mChat.$$('add').add(mChat.$$('input')).prop('disabled', true);
			mChat.refresh(mChat.$$('input').val()).done(function() {
				mChat.$$('input').val('');
			}).always(function() {
				mChat.$$('input').focus();
				mChat.$$('add').add(mChat.$$('input')).prop('disabled', false);
				mChat.resetSession(false);
			});
		},
		edit: function() {
			var $container = $(this).closest('.mchat-message');
			var $message = mChat.$$('confirm').find('textarea').show().val($container.data('mchat-message'));
			mChat.$$('confirm').find('p').text(mChat.editInfo);
			phpbb.confirm(mChat.$$('confirm'), function() {
				ajaxRequest('edit', true, {
					message_id: $container.data('mchat-id'),
					message: $message.val(),
					archive: mChat.archiveMode ? 1 : 0
				}).done(function(json) {
					mChat.sound('edit');
					$container.fadeOut(function() {
						$container.replaceWith($(json.edit).hide().fadeIn());
					});
					if (!mChat.archiveMode) {
						mChat.resetSession(true);
					}
				});
			});
		},
		del: function() {
			var $container = $(this).closest('.mchat-message');
			mChat.$$('confirm').find('textarea').hide();
			mChat.$$('confirm').find('p').text(mChat.delConfirm);
			phpbb.confirm(mChat.$$('confirm'), function() {
				var delId = $container.data('mchat-id');
				ajaxRequest('del', true, {
					message_id: delId
				}).done(function() {
					var index = 0;
					while ((index = $.inArray(delId, mChat.messageIds, index)) !== -1) {
						mChat.messageIds.splice(index, 1);
					}
					mChat.sound('del');
					$container.fadeOut(function() {
						$container.remove();
					});
					if (!mChat.archiveMode) {
						mChat.resetSession(true);
					}
				});
			});
		},
		refresh: function(message) {
			var $messages = mChat.$$('messages').children();
			var data = {
				message_last_id: mChat.messageIds.length ? mChat.messageIds.max() : 0
			};
			if (message) {
				data.message = message;
			}
			if (mChat.liveUpdates) {
				data.message_first_id = mChat.messageIds.length ? mChat.messageIds.min() : 0;
				data.message_edits = {};
				var now = Math.floor(Date.now() / 1000);
				$.each($messages, function() {
					var $message = $(this);
					var editTime = $message.data('mchat-edit-time');
					if (editTime && (!mChat.editDeleteLimit || $message.data('mchat-message-time') >= now - mChat.editDeleteLimit / 1000)) {
						data.message_edits[$message.data('mchat-id')] = editTime;
					}
				});
			}
			mChat.$$('refresh-ok', 'refresh-error', 'refresh-paused').hide();
			mChat.$$('refresh-load').show();
			return ajaxRequest(message ? 'add' : 'refresh', !!message, data).done(function(json) {
				if (json.add) {
					var $html = $(json.add);
					$('#mchat-no-messages').remove();
					$html.reverse(mChat.messageTop).hide().each(function(i) {
						var $message = $(this);
						mChat.messageIds.push($message.data('mchat-id'));
						setTimeout(function() {
							if (mChat.messageTop) {
								mChat.$$('messages').prepend($message);
							} else {
								mChat.$$('messages').append($message);
							}
							$message.css('opacity', 0).slideDown().animate({opacity: 1}, {queue: false});
							mChat.$$('messages').animate({scrollTop: mChat.messageTop ? 0 : mChat.$$('messages')[0].scrollHeight});
						}, i * 400);
						if (mChat.editDeleteLimit && $message.data('mchat-edit-delete-limit') && $message.find('[data-mchat-action="edit"], [data-mchat-action="del"]').length > 0) {
							var id = $message.prop('id');
							setTimeout(function() {
								$('#' + id).find('[data-mchat-action="edit"], [data-mchat-action="del"]').fadeOut(function() {
									$(this).remove();
								});
							}, mChat.editDeleteLimit);
						}
					});
					mChat.sound('add');
					mChat.notice();
				}
				if (json.edit) {
					mChat.sound('edit');
					$(json.edit).each(function() {
						var $newMessage = $(this);
						var $oldMessage = $('#mchat-message-' + $newMessage.data('mchat-id'));
						$oldMessage.fadeOut(function() {
							$oldMessage.replaceWith($newMessage.hide().fadeIn());
						});
					});
				}
				if (json.del) {
					var soundPlayed = false;
					$.each(json.del, function(i, id) {
						var index = 0;
						while ((index = $.inArray(id, mChat.messageIds, index)) !== -1) {
							mChat.messageIds.splice(index, 1);
							var $container = $('#mchat-message-' + id);
							$container.fadeOut(function() {
								$container.remove();
							});
							if (!soundPlayed) {
								soundPlayed = true;
								mChat.sound('del');
							}
						}
					});
				}
				if (json.whois) {
					mChat.whois();
				}
				if (mChat.refreshInterval) {
					mChat.$$('refresh-load', 'refresh-error', 'refresh-paused').hide();
					mChat.$$('refresh-ok').show();
				}
			});
		},
		whois: function() {
			if (mChat.customPage) {
				mChat.$$('refresh-pending').show();
				mChat.$$('refresh-explain').hide();
			}
			ajaxRequest('whois', false, {}).done(function(json) {
				var $whois = $(json.whois);
				var $userlist = $whois.find('#mchat-userlist');
				if (Cookies.get('mchat_show_userlist')) {
					$userlist.show();
				}
				mChat.$$('whois').replaceWith($whois);
				mChat.cache.whois = $whois;
				mChat.cache.userlist = $userlist;
				if (mChat.customPage) {
					mChat.$$('refresh-pending').hide();
					mChat.$$('refresh-explain').show();
				}
			});
		},
		timeLeft: function(sessionTime) {
			return (new Date(sessionTime * 1000)).toUTCString().match(/(\d\d:\d\d:\d\d)/)[0];
		},
		countDown: function() {
			mChat.sessionTime -= 1;
			mChat.$$('session').html(mChat.sessEnds + ' ' + mChat.timeLeft(mChat.sessionTime));
			if (mChat.sessionTime < 1) {
				mChat.endSession();
			}
		},
		pauseSession: function() {
			clearInterval(mChat.refreshInterval);
			if (mChat.userTimeout) {
				clearInterval(mChat.sessionCountdown);
			}
			if (mChat.whoisRefresh) {
				clearInterval(mChat.whoisInterval);
			}
		},
		resetSession: function(updateUi) {
			clearInterval(mChat.refreshInterval);
			mChat.refreshInterval = setInterval(mChat.refresh, mChat.refreshTime);
			if (mChat.userTimeout) {
				mChat.sessionTime = mChat.userTimeout / 1000;
				clearInterval(mChat.sessionCountdown);
				mChat.$$('session').html(mChat.sessEnds + ' ' + mChat.timeLeft(mChat.sessionTime));
				mChat.sessionCountdown = setInterval(mChat.countDown, 1000);
			}
			if (mChat.whoisRefresh) {
				clearInterval(mChat.whoisInterval);
				mChat.whoisInterval = setInterval(mChat.whois, mChat.whoisRefresh);
			}
			if (mChat.pause) {
				mChat.$$('input').one('keypress', mChat.endSession);
			}
			if (updateUi) {
				mChat.$$('refresh-ok').show();
				mChat.$$('refresh-load', 'refresh-error', 'refresh-paused').hide();
				mChat.$$('refresh-text').html(mChat.refreshYes);
			}
		},
		endSession: function() {
			clearInterval(mChat.refreshInterval);
			mChat.refreshInterval = false;
			if (mChat.userTimeout) {
				clearInterval(mChat.sessionCountdown);
				mChat.$$('session').html(mChat.sessOut);
			}
			if (mChat.whoisRefresh) {
				clearInterval(mChat.whoisInterval);
				mChat.whois();
			}
			mChat.$$('refresh-load', 'refresh-ok', 'refresh-error').hide();
			mChat.$$('refresh-paused').show();
			mChat.$$('refresh-text').html(mChat.refreshNo);
		},
		mention: function() {
			var $container = $(this).closest('.mchat-message');
			var username = mChat.entityDecode($container.data('mchat-username'));
			var usercolor = $container.data('mchat-usercolor');
			if (usercolor) {
				username = '[b][color=' + usercolor + ']' + username + '[/color][/b]';
			} else if (mChat.allowBBCodes) {
				username = '[b]' + username + '[/b]';
			}
			insert_text('@ ' + username + ', ');
		},
		quote: function() {
			var $container = $(this).closest('.mchat-message');
			var username = mChat.entityDecode($container.data('mchat-username'));
			var quote = mChat.entityDecode($container.data('mchat-message'));
			insert_text('[quote="' + username + '"] ' + quote + '[/quote]');
		},
		like: function() {
			var $container = $(this).closest('.mchat-message');
			var username = mChat.entityDecode($container.data('mchat-username'));
			var quote = mChat.entityDecode($container.data('mchat-message'));
			insert_text(mChat.likes + '[quote="' + username + '"] ' + quote + '[/quote]');
		},
		entityDecode: function(text) {
			var s = decodeURIComponent(text.toString().replace(/\+/g, ' '));
			s = s.replace(/&lt;/g, '<');
			s = s.replace(/&gt;/g, '>');
			s = s.replace(/&#58;/g, ':');
			s = s.replace(/&#46;/g, '.');
			s = s.replace(/&amp;/g, '&');
			s = s.replace(/&quot;/g, "'");
			return s;
		},
		$$: function() {
			return $($.map(arguments, function(name) {
				if (!mChat.cache[name]) {
					mChat.cache[name] = $('#mchat-' + name);
				}
				return mChat.cache[name];
			})).map(function() {
				return this.toArray();
			});
		}
	});

	mChat.cache = {};
	mChat.$$('confirm').detach().show();

	mChat.messageIds = mChat.$$('messages').children().map(function() {
		return $(this).data('mchat-id');
	}).get();

	mChat.hiddenFields = {};
	$('#mchat-form').find('input[type=hidden]').each(function() {
		mChat.hiddenFields[this.name] = this.value;
	});

	if (!mChat.archiveMode) {
		mChat.resetSession(true);

		if (!mChat.messageTop) {
			mChat.$$('messages').animate({scrollTop: mChat.$$('messages')[0].scrollHeight, easing: 'swing', duration: 'slow'});
		}

		if (!mChat.$$('user-sound').prop('checked')) {
			Cookies.set('mchat_no_sound', 'yes');
		}

		mChat.$$('user-sound').prop('checked', mChat.playSound && !Cookies.get('mchat_no_sound'));

		mChat.$$('user-sound').change(function() {
			if (this.checked) {
				Cookies.remove('mchat_no_sound');
			} else {
				Cookies.set('mchat_no_sound', 'yes');
			}
		});

		$.each(mChat.removeBBCodes.split('|'), function(i, bbcode) {
			$('#format-buttons .bbcode-' + bbcode).remove();
		});

		var $colour_palette = $('#colour_palette');
		$colour_palette.appendTo($colour_palette.parent()).wrap('<div id="mchat-colour"></div>').show();
		$('#bbpalette,#abbc3_bbpalette').prop('onclick', null).attr('data-mchat-toggle', 'colour');

		$.each(['userlist', 'smilies', 'bbcodes', 'colour'], function(i, elem) {
			if (Cookies.get('mchat_show_' + elem)) {
				mChat.$$(elem).toggle();
			}
		});

		if (mChat.$$('input').is('input')) {
			$('#mchat-form').on('keypress', function(e) {
				if (e.which == 13) {
					mChat.add();
					e.preventDefault();
				}
			});
		}

		mChat.$$('input').autoGrowInput({
			minWidth: mChat.$$('input').width(),
			maxWidth: mChat.$$('form').width() - (mChat.$$('input').outerWidth(true) - mChat.$$('input').width())
		});
	}

	$(window).on('beforeunload', function() {
		mChat.pageIsUnloading = true;
	});

	$('#phpbb').on('click', '[data-mchat-action]', function(e) {
		var action = $(this).data('mchat-action');
		mChat[action].call(this);
		e.preventDefault();
	}).on('click', '[data-mchat-toggle]', function(e) {
		var elem = $(this).data('mchat-toggle');
		mChat.toggle(elem);
		e.preventDefault();
	});
});
<h1><i class="fa fa-key"></i> Generic OAuth Authentication</h1>
<hr />

<form class="sso-oauth-settings">
	<div class="alert alert-warning">
		<p>
			Please refer to your OAuth provider&apos;s documentation for appropriate values. All fields are mandatory.
		</p>
		<br />
		<select name="oauth:type" title="OAuth Strategy" class="form-control">
			<option value="x">Disabled</option>
			<option value="1">OAuth</option>
			<option value="2">OAuth2</option>
		</select>
		<hr />
		<div class="form-group">
			<input type="text" data-strategy="1" name="oauth:key" title="OAuth Key" class="form-control input-lg" placeholder="OAuth Key">
		</div>
		<div class="form-group">
			<input type="text" data-strategy="1" name="oauth:secret" title="OAuth Secret" class="form-control" placeholder="OAuth Secret">
		</div>
		<div class="form-group">
			<input type="text" data-strategy="1" name="oauth:reqTokenUrl" title="Token Request URL" class="form-control" placeholder="Token Request URL">
		</div>
		<div class="form-group">
			<input type="text" data-strategy="1" name="oauth:accessTokenUrl" title="Access Token URL" class="form-control" placeholder="Access Token URL">
		</div>
		<div class="form-group">
			<input type="text" data-strategy="1" name="oauth:authUrl" title="Authorization URL" class="form-control" placeholder="Authorization URL">
		</div>

		<div class="form-group">
			<input type="text" data-strategy="2" name="oauth2:id" title="Client ID" class="form-control input-lg" placeholder="Client ID">
		</div>
		<div class="form-group">
			<input type="text" data-strategy="2" name="oauth2:secret" title="Client Secret" class="form-control" placeholder="Client Secret">
		</div>
		<div class="form-group">
			<input type="text" data-strategy="2" name="oauth2:authUrl" title="Authorization URL" class="form-control" placeholder="Authorization URL">
		</div>
		<div class="form-group">
			<input type="text" data-strategy="2" name="oauth2:tokenUrl" title="Token URL" class="form-control" placeholder="Token URL">
		</div>

		<div class="form-group">
			<input type="text" name="oauth:userProfileUrl" title="User Profile URL" class="form-control" placeholder="User Profile URL">
		</div>
	</div>
</form>

<button class="btn btn-lg btn-primary" type="button" id="save">Save</button>

<script>
	require(['settings'], function(Settings) {
		Settings.load('sso-oauth', $('.sso-oauth-settings'), function() {
			var	OAuthType = $('[name="oauth:type"]').val();
			toggleFields(OAuthType);
		});

		$('#save').on('click', function() {
			Settings.save('sso-oauth', $('.sso-oauth-settings'));
		});
	});

	var	toggleFields = function(value) {
		if (value === '1') {
			$('[data-strategy="2"]').hide();
			$('[data-strategy="1"]').show();
		} else if (value === '2') {
			$('[data-strategy="1"]').hide();
			$('[data-strategy="2"]').show();
		} else {
			$('[data-strategy]').hide();
		}
	}

	toggleFields(false);
	$('[name="oauth:type"]').on('change', function() {
		toggleFields(this.value);
	})
</script>
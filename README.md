# README

#### Requirements:
* Node 10.x
* yarn

#### Environment variables:
To add environment variables create `.env` file in the root of the project. 

Available variables:
```
ENV={prod, dev, stag}
BASE_URL={} // for production write url path here
RENDER_ALL_LANGUAGES={false, true}  // only for development
```

#### For development:
* Change `ENV` variable to `dev` and if you want to render all languages set `RENDER_ALL_LANGUAGES=true`
* Execute command `yarn develop`

#### Running in production:
* Run `yarn`. This will install all dependencies and build project to `/dist` folder

#### Possible errors:
If gulp commands do not work, try install gulp globally

# Module maître
module maître `master`, qui centralise l’installation *Polyptyque* — localement.

## installation

Require l’installation préalable de [node](https://nodejs.org/). Ensuite, depuis la racine du projet, il suffit de taper dans le terminal : 

    npm install

## exécution

C’est simple, c’est un serveur web. Il suffit de le lancer avec cette commande : 

	node index

Apparaît alors quelque chose comme ça :

	Server listening on: http://localhost:8080
	
Il suffit d’ouvrir l’adresse indiquée dans son navigateur. 
Pour quitter, faire `ctrl`+`c` au clavier. 

Sur un réseau interne on peut accéder au site depuis un autre appareil, avec l’adresse IP de l’hôte. Par exemple `http://192.168.1.44:8080`

## configuration 

Le fichier de configuration est le fichier `config.json` au format `JSON`.

Les étapes du formulaires sont représentées par le tableau `steps`. Les questions/champs des étapes sont représentées par le tableau `fields`

## templates html

Les templates html du formulaire utilisent [handlebars](http://handlebarsjs.com/)
et sont localisés dans le dossier `views` et ses sous-dossiers.

Par exemple le layout principal est dans `views/layouts/main`

## styles CSS

Les styles de bases s’appuient sur [Bootstrap](http://getbootstrap.com/). Les surcharges CSS peuvent se faire dans le fichier `public/css/main.css`